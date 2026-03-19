import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DataSyncLog,
  type DataSyncStatus,
  type DataSyncTrigger,
} from './entities/data-sync-log.entity';

const execAsync = promisify(exec);

const SYNC_SEEDS = [
  { key: 'welfare', name: '중앙부처 복지서비스', script: 'welfare-api.seed.ts' },
  { key: 'local-welfare', name: '지자체 복지서비스', script: 'local-welfare.seed.ts' },
  { key: 'rental-housing', name: '공공임대주택 단지', script: 'rental-housing.seed.ts' },
  { key: 'facility', name: '사회복지시설', script: 'welfare-facility.seed.ts' },
  { key: 'housing-announcement', name: '공공주택 모집공고', script: 'housing-announcement.seed.ts' },
  { key: 'applyhome', name: '청약홈 분양정보', script: 'applyhome.seed.ts' },
  { key: 'applyhome-cmpet', name: '청약 경쟁률', script: 'applyhome-cmpet.seed.ts' },
  { key: 'applyhome-stat', name: '청약 통계', script: 'applyhome-stat.seed.ts' },
] as const;

type SyncSeedConfig = (typeof SYNC_SEEDS)[number];
type SeedExecutionResult = {
  success: boolean;
  summary: string;
  stdout: string;
  stderr: string;
  vectorCount: number | null;
  graphCount: number | null;
  skippedCount: number | null;
};

@Injectable()
export class DataSyncService {
  private readonly logger = new Logger(DataSyncService.name);
  private isSyncing = false;
  private lastSyncAt: Date | null = null;
  private lastSyncResult: { success: boolean; message: string } | null = null;

  private readonly qdrant: QdrantClient;
  private readonly neo4jDriver: ReturnType<typeof neo4j.driver>;
  private readonly collection: string;
  private readonly appDir: string;
  private readonly seedDir: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(DataSyncLog)
    private readonly logRepo: Repository<DataSyncLog>,
  ) {
    this.qdrant = new QdrantClient({ url: config.get('QDRANT_URL', 'http://localhost:6333') });
    this.neo4jDriver = neo4j.driver(
      config.get('NEO4J_URI', 'bolt://localhost:7687'),
      neo4j.auth.basic(
        config.get('NEO4J_USERNAME', 'neo4j'),
        config.getOrThrow<string>('NEO4J_PASSWORD'),
      ),
    );
    this.collection = config.get('QDRANT_COLLECTION', 'welfare_policies');

    const cwd = process.cwd();
    const packageRoot = existsSync(path.resolve(cwd, 'src/database/seeds'))
      ? cwd
      : path.resolve(cwd, 'apps/api');

    this.appDir = packageRoot;
    this.seedDir = path.resolve(packageRoot, 'src/database/seeds');
  }

  @Cron('0 2 * * *', { name: 'daily-data-sync', timeZone: 'Asia/Seoul' })
  async scheduledSync() {
    this.logger.log('⏰ 자동 데이터 동기화 시작');
    await this.runSync('CRON');
  }

  async runSync(trigger: DataSyncTrigger = 'MANUAL'): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      return { success: false, message: '이미 동기화 진행 중입니다.' };
    }

    this.isSyncing = true;
    const runId = randomUUID();
    const results: string[] = [];
    let allSucceeded = true;

    try {
      for (const seed of SYNC_SEEDS) {
        const result = await this.executeSeed(seed, runId, trigger);
        results.push(result.summary);
        if (!result.success) {
          allSucceeded = false;
        }
      }

      const message = results.join('\n');
      this.lastSyncResult = { success: allSucceeded, message };
      this.lastSyncAt = new Date();
      this.logger.log(allSucceeded ? '🎉 전체 데이터 동기화 완료' : '⚠️ 일부 데이터 동기화 실패');
      return { success: allSucceeded, message };
    } finally {
      this.isSyncing = false;
    }
  }

  async runSeed(seedKey: string, trigger: DataSyncTrigger = 'SEED') {
    if (this.isSyncing) {
      return { success: false, message: '이미 동기화 진행 중입니다.' };
    }

    const seed = SYNC_SEEDS.find((item) => item.key === seedKey);
    if (!seed) {
      return { success: false, message: `알 수 없는 시드입니다: ${seedKey}` };
    }

    this.isSyncing = true;
    try {
      const result = await this.executeSeed(seed, randomUUID(), trigger);
      this.lastSyncResult = { success: result.success, message: result.summary };
      this.lastSyncAt = new Date();
      return { success: result.success, message: result.summary };
    } finally {
      this.isSyncing = false;
    }
  }

  async getRecentLogs(limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return this.logRepo.find({
      order: { startedAt: 'DESC' },
      take: safeLimit,
    });
  }

  getSeedCatalog() {
    return SYNC_SEEDS.map(({ key, name, script }) => ({ key, name, script }));
  }

  async getQdrantStats(): Promise<Record<string, unknown>> {
    try {
      const info = await this.qdrant.getCollection(this.collection);
      const result = info as Record<string, unknown>;
      const config = result.config as Record<string, unknown> | undefined;
      const params = config?.params as Record<string, unknown> | undefined;
      const vectors = params?.vectors as Record<string, unknown> | undefined;
      return {
        collection: this.collection,
        pointsCount: result.points_count,
        indexedVectorsCount: result.indexed_vectors_count,
        vectorSize: vectors?.size,
        status: result.status,
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  async getNeo4jStats(): Promise<Record<string, unknown>> {
    const session = this.neo4jDriver.session();
    try {
      const labelRes = await session.run(`
        CALL apoc.meta.stats()
        YIELD labels
        RETURN labels
      `).catch(() => null);

      const labelCounts: Record<string, number> = {};
      if (labelRes && labelRes.records.length > 0) {
        const raw = labelRes.records[0].get('labels') as Record<string, unknown>;
        for (const [k, v] of Object.entries(raw)) {
          const n = typeof v === 'object' && v !== null && 'toNumber' in v
            ? (v as { toNumber: () => number }).toNumber()
            : Number(v);
          if (n > 0) labelCounts[k] = n;
        }
      } else {
        const labels = [
          'Policy',
          'WelfareFacility',
          'HousingComplex',
          'HousingAnnouncement',
          'LifeStage',
          'Theme',
          'TargetGroup',
          'Region',
          'FacilityKind',
          'Institution',
        ];
        for (const label of labels) {
          const r = await session.run(`MATCH (n:${label}) RETURN count(n) AS cnt`);
          const cnt = r.records[0]?.get('cnt')?.toNumber?.() ?? 0;
          if (cnt > 0) labelCounts[label] = cnt;
        }
      }

      const relRes = await session.run('MATCH ()-[r]->() RETURN count(r) AS cnt');
      const relCount = relRes.records[0]?.get('cnt')?.toNumber?.() ?? 0;

      return { nodes: labelCounts, relationships: relCount };
    } catch (e) {
      return { error: (e as Error).message };
    } finally {
      await session.close();
    }
  }

  getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSyncAt: this.lastSyncAt,
      lastResult: this.lastSyncResult,
    };
  }

  private async executeSeed(
    seed: SyncSeedConfig,
    runId: string,
    trigger: DataSyncTrigger,
  ): Promise<SeedExecutionResult> {
    this.logger.log(`🌱 ${seed.name} 동기화 중...`);
    const startedAt = new Date();
    const log = await this.logRepo.save(
      this.logRepo.create({
        runId,
        seedKey: seed.key,
        seedName: seed.name,
        script: seed.script,
        trigger,
        status: 'RUNNING',
        startedAt,
      }),
    );

    const scriptPath = path.join(this.seedDir, seed.script);
    try {
      const { stdout, stderr } = await execAsync(
        `pnpm exec ts-node -r dotenv/config --transpile-only "${scriptPath}"`,
        {
          cwd: this.appDir,
          env: { ...process.env },
          timeout: 30 * 60 * 1000,
        },
      );

      const parsed = this.parseSeedOutput(stdout, stderr);
      if (this.hasFatalStderr(stderr)) {
        const failed: SeedExecutionResult = {
          ...parsed,
          success: false,
          summary: `❌ ${seed.name}: ${this.extractErrorSummary(stderr)}`,
        };
        await this.finishLog(log, 'FAILED', startedAt, failed);
        this.logger.error(`❌ ${seed.name} 실패: ${this.extractErrorSummary(stderr)}`);
        return failed;
      }

      await this.finishLog(log, 'SUCCESS', startedAt, parsed);
      this.logger.log(`✅ ${seed.name} 완료`);
      return { ...parsed, success: true };
    } catch (e) {
      const stdout = (e as { stdout?: string }).stdout ?? '';
      const stderr = (e as { stderr?: string }).stderr ?? '';
      const msg = (e as Error).message.slice(0, 400);
      const parsed = this.parseSeedOutput(stdout, stderr);
      const failed: SeedExecutionResult = {
        ...parsed,
        success: false,
        summary: `❌ ${seed.name}: ${msg}`,
        stderr: this.mergeOutput(parsed.stderr, msg),
      };
      await this.finishLog(log, 'FAILED', startedAt, failed);
      this.logger.error(`❌ ${seed.name} 실패: ${msg}`);
      return failed;
    }
  }

  private async finishLog(
    log: DataSyncLog,
    status: DataSyncStatus,
    startedAt: Date,
    result: SeedExecutionResult,
  ) {
    const finishedAt = new Date();
    await this.logRepo.save({
      ...log,
      status,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      vectorCount: result.vectorCount,
      graphCount: result.graphCount,
      skippedCount: result.skippedCount,
      summary: result.summary,
      stdout: result.stdout,
      stderr: result.stderr || null,
    });
  }

  private parseSeedOutput(stdout: string, stderr: string): SeedExecutionResult {
    const output = stdout.trim();
    const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
    const tail = lines.slice(-4).join('\n');
    const summary = tail || lines.at(-1) || '실행 로그가 없습니다.';

    return {
      success: true,
      summary,
      stdout: this.trimOutput(stdout),
      stderr: this.trimOutput(stderr),
      vectorCount: this.extractLastCount(output, '벡터'),
      graphCount: this.extractLastCount(output, '그래프'),
      skippedCount: this.extractLastCount(output, '스킵'),
    };
  }

  private extractLastCount(output: string, label: string) {
    const patterns = [
      new RegExp(`${label}\\s*[:\\-]?\\s*(\\d+)`, 'g'),
      new RegExp(`${label}\\s+(\\d+)[개건]?`, 'g'),
    ];

    let value: number | null = null;
    for (const pattern of patterns) {
      for (const match of output.matchAll(pattern)) {
        value = Number(match[1]);
      }
      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  private trimOutput(value: string, maxLength = 6000) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.length <= maxLength ? trimmed : trimmed.slice(-maxLength);
  }

  private mergeOutput(base: string, extra: string) {
    return this.trimOutput([base, extra].filter(Boolean).join('\n'));
  }

  private hasFatalStderr(stderr: string) {
    const trimmed = stderr.trim();
    if (!trimmed) return false;

    return /(authenticationerror|incorrect api key|invalid_api_key|missing required environment variable|command failed|(^|\b)error(\b|:)|exception)/i.test(
      trimmed,
    );
  }

  private extractErrorSummary(stderr: string) {
    const lines = stderr
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.find((line) => /(authenticationerror|incorrect api key|invalid_api_key|missing required environment variable|command failed|(^|\b)error(\b|:)|exception)/i.test(line))
      ?? lines.at(-1)
      ?? '실행 중 오류가 발생했습니다.';
  }
}
