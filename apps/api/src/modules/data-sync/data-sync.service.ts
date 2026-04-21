import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
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

const SYNC_SEEDS = [
  { key: 'welfare', name: '중앙부처 복지서비스', script: 'welfare-api.seed.ts' },
  { key: 'local-welfare', name: '지자체 복지서비스', script: 'local-welfare.seed.ts' },
  { key: 'youth-policy', name: '청년정책', script: 'youth-policy.seed.ts' },
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

type SeedProgressSnapshot = {
  phase?: string | null;
  itemTotal?: number | null;
  fetchCurrent?: number | null;
  fetchTotal?: number | null;
  processCurrent?: number | null;
  processTotal?: number | null;
  vectorCurrent?: number | null;
  vectorTotal?: number | null;
  graphCurrent?: number | null;
  graphTotal?: number | null;
  skippedCount?: number | null;
};

type SyncStartResult = {
  success: boolean;
  message: string;
  runId: string | null;
};

type SyncRunSeedProgress = {
  id: string;
  runId: string;
  seedKey: string;
  seedName: string;
  script: string;
  orderIndex: number;
  trigger: DataSyncTrigger;
  status: DataSyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  summary: string | null;
  phase: string | null;
  itemTotal: number | null;
  fetchCurrent: number | null;
  fetchTotal: number | null;
  processCurrent: number | null;
  processTotal: number | null;
  vectorCurrent: number | null;
  vectorTotal: number | null;
  graphCurrent: number | null;
  graphTotal: number | null;
  vectorCount: number | null;
  graphCount: number | null;
  skippedCount: number | null;
  stdout: string | null;
  stderr: string | null;
  progressPercent: number;
  progressLabel: string;
};

type SyncRunAggregate = {
  runId: string;
  startedAt: Date;
  finishedAt: Date | null;
  isActive: boolean;
  hasFailure: boolean;
  totalSeeds: number;
  completedSeeds: number;
  message: string | null;
};

export type SyncSourceStatus = {
  id: string;
  runId: string;
  seedKey: string;
  seedName: string;
  script: string;
  trigger: DataSyncTrigger;
  status: DataSyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  summary: string | null;
  phase: string | null;
  vectorCount: number | null;
  graphCount: number | null;
  skippedCount: number | null;
};

@Injectable()
export class DataSyncService {
  private readonly logger = new Logger(DataSyncService.name);
  private isSyncing = false;
  private currentRunId: string | null = null;

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
    await this.startSync('CRON');
  }

  async startSync(trigger: DataSyncTrigger = 'MANUAL'): Promise<SyncStartResult> {
    const activeRunId = await this.getActiveRunId();
    if (activeRunId) {
      return {
        success: false,
        message: '이미 동기화 진행 중입니다.',
        runId: activeRunId,
      };
    }

    const runId = randomUUID();
    this.isSyncing = true;
    this.currentRunId = runId;

    await this.createRunLogs(runId, trigger, SYNC_SEEDS);

    void this.executeRun(runId, trigger, SYNC_SEEDS);

    return {
      success: true,
      message: '동기화 시작됨. 진행도는 current run API에서 확인할 수 있습니다.',
      runId,
    };
  }

  async startSeed(seedKey: string, trigger: DataSyncTrigger = 'SEED'): Promise<SyncStartResult> {
    const activeRunId = await this.getActiveRunId();
    if (activeRunId) {
      return {
        success: false,
        message: '이미 동기화 진행 중입니다.',
        runId: activeRunId,
      };
    }

    const seed = SYNC_SEEDS.find((item) => item.key === seedKey);
    if (!seed) {
      return {
        success: false,
        message: `알 수 없는 시드입니다: ${seedKey}`,
        runId: null,
      };
    }

    const runId = randomUUID();
    this.isSyncing = true;
    this.currentRunId = runId;

    await this.createRunLogs(runId, trigger, [seed]);

    void this.executeRun(runId, trigger, [seed]);

    return {
      success: true,
      message: `${seed.name} 시드 동기화 시작됨.`,
      runId,
    };
  }

  async getRecentLogs(limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return this.logRepo.find({
      order: { startedAt: 'DESC' },
      take: safeLimit,
    });
  }

  async getCurrentRunProgress() {
    const activeRunId = await this.getActiveRunId();
    if (!activeRunId) {
      return null;
    }

    return this.getRunProgress(activeRunId);
  }

  async getRunProgress(runId: string) {
    const logs = await this.logRepo.find({
      where: { runId },
      order: { orderIndex: 'ASC', startedAt: 'ASC' },
    });

    if (logs.length === 0) {
      return null;
    }

    const seeds = logs.map((log) => this.mapSeedProgress(log));
    const completedSeeds = seeds.filter((seed) => seed.status === 'SUCCESS' || seed.status === 'FAILED').length;
    const startedAt = logs.reduce((min, log) => {
      if (!min) return log.startedAt;
      return log.startedAt < min ? log.startedAt : min;
    }, logs[0]?.startedAt ?? null);
    const finishedSeeds = logs.filter((log) => log.finishedAt);
    const finishedAt = finishedSeeds.length === logs.length
      ? finishedSeeds.reduce((max, log) => {
        if (!max || !log.finishedAt) return log.finishedAt ?? max;
        return log.finishedAt > max ? log.finishedAt : max;
      }, finishedSeeds[0]?.finishedAt ?? null)
      : null;

    const status = logs.some((log) => log.status === 'RUNNING' || log.status === 'PENDING')
      ? 'RUNNING'
      : logs.some((log) => log.status === 'FAILED')
        ? 'FAILED'
        : 'SUCCESS';

    const progressPercent = seeds.length > 0
      ? Math.round(seeds.reduce((sum, seed) => sum + seed.progressPercent, 0) / seeds.length)
      : 0;

    return {
      runId,
      status,
      isActive: this.currentRunId === runId && this.isSyncing,
      startedAt,
      finishedAt,
      totalSeeds: seeds.length,
      completedSeeds,
      progressPercent,
      seeds,
    };
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

  async getSyncStatus() {
    const activeRun = await this.getLatestRunAggregate({ activeOnly: true });
    const latestCompletedRun = await this.getLatestRunAggregate({ completedOnly: true });

    return {
      isSyncing: Boolean(activeRun),
      currentRunId: activeRun?.runId ?? null,
      lastSyncAt: latestCompletedRun?.finishedAt ?? null,
      lastResult: latestCompletedRun
        ? {
            success: !latestCompletedRun.hasFailure,
            message: latestCompletedRun.message ?? '',
          }
        : null,
    };
  }

  async getSourceStatuses(): Promise<SyncSourceStatus[]> {
    const rows = await this.logRepo.query(`
      SELECT DISTINCT ON ("seedKey")
        id,
        "runId",
        "seedKey",
        "seedName",
        script,
        trigger,
        status,
        "startedAt",
        "finishedAt",
        "durationMs",
        summary,
        phase,
        "vectorCount",
        "graphCount",
        "skippedCount"
      FROM data_sync_logs
      ORDER BY "seedKey", "startedAt" DESC
    `);

    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      runId: String(row.runId),
      seedKey: String(row.seedKey),
      seedName: String(row.seedName),
      script: String(row.script),
      trigger: row.trigger as DataSyncTrigger,
      status: row.status as DataSyncStatus,
      startedAt: new Date(String(row.startedAt)),
      finishedAt: row.finishedAt ? new Date(String(row.finishedAt)) : null,
      durationMs: row.durationMs === null ? null : Number(row.durationMs),
      summary: row.summary ? String(row.summary) : null,
      phase: row.phase ? String(row.phase) : null,
      vectorCount: row.vectorCount === null ? null : Number(row.vectorCount),
      graphCount: row.graphCount === null ? null : Number(row.graphCount),
      skippedCount: row.skippedCount === null ? null : Number(row.skippedCount),
    }));
  }

  private async createRunLogs(
    runId: string,
    trigger: DataSyncTrigger,
    seeds: readonly SyncSeedConfig[],
  ) {
    const now = new Date();
    const logs = seeds.map((seed, orderIndex) =>
      this.logRepo.create({
        runId,
        seedKey: seed.key,
        seedName: seed.name,
        script: seed.script,
        orderIndex,
        trigger,
        status: seeds.length === 1 ? 'RUNNING' : 'PENDING',
        startedAt: now,
        phase: seeds.length === 1 ? '실행 준비 중' : '대기 중',
      }),
    );

    await this.logRepo.save(logs);
  }

  private async executeRun(
    runId: string,
    trigger: DataSyncTrigger,
    seeds: readonly SyncSeedConfig[],
  ) {
    const results: string[] = [];
    let allSucceeded = true;

    try {
      const logs = await this.logRepo.find({
        where: { runId },
        order: { orderIndex: 'ASC' },
      });
      const logMap = new Map(logs.map((log) => [log.seedKey, log]));

      for (const seed of seeds) {
        const log = logMap.get(seed.key);
        if (!log) continue;

        const result = await this.executeSeed(seed, runId, trigger, log);
        results.push(result.summary);
        if (!result.success) {
          allSucceeded = false;
        }
      }

      this.logger.log(allSucceeded ? '🎉 전체 데이터 동기화 완료' : '⚠️ 일부 데이터 동기화 실패');
    } catch (error) {
      this.logger.error(`❌ 데이터 동기화 실행 실패: ${(error as Error).message}`);
    } finally {
      if (this.currentRunId === runId) {
        this.currentRunId = null;
      }
      this.isSyncing = false;
    }
  }

  private async executeSeed(
    seed: SyncSeedConfig,
    runId: string,
    trigger: DataSyncTrigger,
    log: DataSyncLog,
  ): Promise<SeedExecutionResult> {
    this.logger.log(`🌱 ${seed.name} 동기화 중...`);
    const startedAt = new Date();
    await this.logRepo.update(log.id, {
      status: 'RUNNING',
      startedAt,
      finishedAt: null,
      durationMs: null,
      phase: '실행 준비 중',
      stdout: null,
      stderr: null,
      vectorCount: null,
      graphCount: null,
      skippedCount: null,
      itemTotal: null,
      fetchCurrent: null,
      fetchTotal: null,
      processCurrent: null,
      processTotal: null,
      vectorCurrent: null,
      vectorTotal: null,
      graphCurrent: null,
      graphTotal: null,
    });

    const scriptPath = path.join(this.seedDir, seed.script);
    const child = spawn(
      'pnpm',
      ['exec', 'ts-node', '-r', 'dotenv/config', '--transpile-only', scriptPath],
      {
        cwd: this.appDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    let lastPersistSignature = '';
    let persistQueue = Promise.resolve();

    const enqueuePersist = () => {
      persistQueue = persistQueue
        .then(async () => {
          const progress = this.extractSeedProgress(stdout, stderr);
          const patch = {
            phase: progress.phase ?? null,
            itemTotal: progress.itemTotal ?? null,
            fetchCurrent: progress.fetchCurrent ?? null,
            fetchTotal: progress.fetchTotal ?? null,
            processCurrent: progress.processCurrent ?? null,
            processTotal: progress.processTotal ?? null,
            vectorCurrent: progress.vectorCurrent ?? null,
            vectorTotal: progress.vectorTotal ?? null,
            graphCurrent: progress.graphCurrent ?? null,
            graphTotal: progress.graphTotal ?? null,
            skippedCount: progress.skippedCount ?? null,
            stdout: this.trimOutput(stdout),
            stderr: this.trimOutput(stderr) || null,
          };
          const signature = JSON.stringify(patch);
          if (signature === lastPersistSignature) return;
          lastPersistSignature = signature;
          await this.logRepo.update(log.id, patch);
        })
        .catch((error) => {
          this.logger.warn(`진행도 저장 실패 [${seed.key}]: ${(error as Error).message}`);
        });
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      enqueuePersist();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      enqueuePersist();
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? 1));
    }).catch(async (error) => {
      stderr = this.mergeOutput(stderr, (error as Error).message);
      await persistQueue;
      return 1;
    });

    await persistQueue;

    const parsed = this.parseSeedOutput(stdout, stderr);
    if (exitCode !== 0 || this.hasFatalStderr(stderr)) {
      const failed: SeedExecutionResult = {
        ...parsed,
        success: false,
        summary: `❌ ${seed.name}: ${exitCode !== 0 ? this.extractErrorSummary(stderr || parsed.summary) : this.extractErrorSummary(stderr)}`,
        stderr: exitCode !== 0 ? this.mergeOutput(parsed.stderr, `exit code ${exitCode}`) : parsed.stderr,
      };
      await this.finishLog(log.id, 'FAILED', startedAt, failed, stdout, stderr);
      this.logger.error(`❌ ${seed.name} 실패: ${failed.summary}`);
      return failed;
    }

    await this.finishLog(log.id, 'SUCCESS', startedAt, parsed, stdout, stderr);
    this.logger.log(`✅ ${seed.name} 완료`);
    return { ...parsed, success: true };
  }

  private async finishLog(
    logId: string,
    status: DataSyncStatus,
    startedAt: Date,
    result: SeedExecutionResult,
    stdout: string,
    stderr: string,
  ) {
    const finishedAt = new Date();
    const progress = this.extractSeedProgress(stdout, stderr);
    await this.logRepo.update(logId, {
      status,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      vectorCount: result.vectorCount,
      graphCount: result.graphCount,
      skippedCount: result.skippedCount,
      summary: result.summary,
      stdout: result.stdout,
      stderr: result.stderr || null,
      phase: status === 'SUCCESS' ? '완료' : progress.phase ?? '실패',
      itemTotal: progress.itemTotal ?? null,
      fetchCurrent: progress.fetchCurrent ?? progress.fetchTotal ?? null,
      fetchTotal: progress.fetchTotal ?? null,
      processCurrent: progress.processCurrent ?? progress.processTotal ?? null,
      processTotal: progress.processTotal ?? null,
      vectorCurrent: progress.vectorCurrent ?? progress.vectorTotal ?? result.vectorCount ?? null,
      vectorTotal: progress.vectorTotal ?? result.vectorCount ?? null,
      graphCurrent: progress.graphCurrent ?? progress.graphTotal ?? result.graphCount ?? null,
      graphTotal: progress.graphTotal ?? result.graphCount ?? null,
    });
  }

  private mapSeedProgress(log: DataSyncLog): SyncRunSeedProgress {
    const progressPercent = this.calculateSeedProgress(log);
    return {
      id: log.id,
      runId: log.runId,
      seedKey: log.seedKey,
      seedName: log.seedName,
      script: log.script,
      orderIndex: log.orderIndex,
      trigger: log.trigger,
      status: log.status,
      startedAt: log.startedAt,
      finishedAt: log.finishedAt ?? null,
      durationMs: log.durationMs ?? null,
      summary: log.summary ?? null,
      phase: log.phase ?? null,
      itemTotal: log.itemTotal ?? null,
      fetchCurrent: log.fetchCurrent ?? null,
      fetchTotal: log.fetchTotal ?? null,
      processCurrent: log.processCurrent ?? null,
      processTotal: log.processTotal ?? null,
      vectorCurrent: log.vectorCurrent ?? null,
      vectorTotal: log.vectorTotal ?? null,
      graphCurrent: log.graphCurrent ?? null,
      graphTotal: log.graphTotal ?? null,
      vectorCount: log.vectorCount ?? null,
      graphCount: log.graphCount ?? null,
      skippedCount: log.skippedCount ?? null,
      stdout: log.stdout ?? null,
      stderr: log.stderr ?? null,
      progressPercent,
      progressLabel: this.buildSeedProgressLabel(log),
    };
  }

  private calculateSeedProgress(log: DataSyncLog) {
    if (log.status === 'SUCCESS' || log.status === 'FAILED') {
      return 100;
    }

    const workTotal = (log.vectorTotal ?? 0) + (log.graphTotal ?? 0);
    const workDone = (log.vectorCurrent ?? 0) + (log.graphCurrent ?? 0);
    if (workTotal > 0) {
      return Math.max(2, Math.min(99, Math.round((workDone / workTotal) * 100)));
    }

    if ((log.processTotal ?? 0) > 0 && log.processCurrent !== null && log.processCurrent !== undefined) {
      return Math.max(2, Math.min(99, Math.round(((log.processCurrent ?? 0) / (log.processTotal ?? 1)) * 100)));
    }

    if ((log.fetchTotal ?? 0) > 0 && log.fetchCurrent !== null && log.fetchCurrent !== undefined) {
      return Math.max(2, Math.min(99, Math.round(((log.fetchCurrent ?? 0) / (log.fetchTotal ?? 1)) * 100)));
    }

    if (log.phase?.includes('변경 없음')) {
      return 100;
    }

    return log.status === 'RUNNING' ? 5 : 0;
  }

  private buildSeedProgressLabel(log: DataSyncLog) {
    if (log.status === 'PENDING') return '대기 중';
    if (log.phase?.includes('변경 없음')) return '변경 없음';

    if ((log.vectorTotal ?? 0) > 0 || (log.graphTotal ?? 0) > 0) {
      const parts = [];
      if ((log.vectorTotal ?? 0) > 0) {
        parts.push(`벡터 ${log.vectorCurrent ?? 0}/${log.vectorTotal}`);
      }
      if ((log.graphTotal ?? 0) > 0) {
        parts.push(`그래프 ${log.graphCurrent ?? 0}/${log.graphTotal}`);
      }
      return parts.join(' · ');
    }

    if ((log.processTotal ?? 0) > 0) {
      return `처리 ${log.processCurrent ?? 0}/${log.processTotal}`;
    }

    if ((log.fetchTotal ?? 0) > 0) {
      return `수집 ${log.fetchCurrent ?? 0}/${log.fetchTotal}`;
    }

    return log.phase ?? '실행 중';
  }

  private extractSeedProgress(stdout: string, stderr: string): SeedProgressSnapshot {
    const output = [stdout, stderr].filter(Boolean).join('\n').replace(/\r/g, '\n');
    const snapshot: SeedProgressSnapshot = {};

    const totalWithPages = this.extractLastNumbers(output, /총\s+(\d+)개(?:[^,\n]*)[, ]\s*(\d+)\s*페이지/g, 2);
    if (totalWithPages) {
      snapshot.itemTotal = totalWithPages[0];
      snapshot.fetchTotal = totalWithPages[1];
    }

    const totalItems = this.extractLastNumbers(output, /총\s+(\d+)개(?:\s+\S+)?/g, 1);
    if (!snapshot.itemTotal && totalItems) {
      snapshot.itemTotal = totalItems[0];
    }

    const regionTarget = this.extractLastNumbers(output, /대상:\s*(\d+)개\s*시군구/g, 1);
    if (regionTarget) {
      snapshot.fetchTotal = regionTarget[0];
    }

    const pageProgress = this.extractLastNumbers(output, /페이지\s+(\d+)\/(\d+)/g, 2);
    const regionProgress = this.extractLastNumbers(output, /수집 중:\s*(\d+)\/(\d+)\s*시군구/g, 2);
    const endpointProgress = this.extractLastNumbers(output, /\b(\d+)\/(\d+)p\b/g, 2);
    const fetchProgress = regionProgress ?? pageProgress ?? endpointProgress;
    if (fetchProgress) {
      snapshot.fetchCurrent = fetchProgress[0];
      snapshot.fetchTotal = fetchProgress[1];
    }

    const processProgress = this.extractLastNumbers(output, /\[(\d+)\/(\d+)\]\s*처리 완료/g, 2);
    if (processProgress) {
      snapshot.processCurrent = processProgress[0];
      snapshot.processTotal = processProgress[1];
    }

    const vectorProgress = this.extractLastNumbers(output, /벡터\s*\[(\d+)\/(\d+)\]\s*처리 완료/g, 2);
    if (vectorProgress) {
      snapshot.vectorCurrent = vectorProgress[0];
      snapshot.vectorTotal = vectorProgress[1];
    }

    const graphProgress = this.extractLastNumbers(output, /그래프\s*\[(\d+)\/(\d+)\]\s*처리 완료/g, 2);
    if (graphProgress) {
      snapshot.graphCurrent = graphProgress[0];
      snapshot.graphTotal = graphProgress[1];
    }

    const vectorGraphSkip = this.extractLastNumbers(
      output,
      /증분 대상\s*-\s*벡터\s*(\d+)[건개],\s*그래프\s*(\d+)[건개],\s*스킵\s*(\d+)[건개]/g,
      3,
    );
    if (vectorGraphSkip) {
      snapshot.vectorTotal = vectorGraphSkip[0];
      snapshot.graphTotal = vectorGraphSkip[1];
      snapshot.skippedCount = vectorGraphSkip[2];
    }

    const vectorOnlySkip = this.extractLastNumbers(
      output,
      /증분 대상\s*-\s*벡터\s*(\d+)[건개],\s*스킵\s*(\d+)[건개]/g,
      2,
    );
    if (!vectorGraphSkip && vectorOnlySkip) {
      snapshot.vectorTotal = vectorOnlySkip[0];
      snapshot.graphTotal = 0;
      snapshot.skippedCount = vectorOnlySkip[1];
    }

    snapshot.phase = this.extractLatestPhase(output);

    return snapshot;
  }

  private extractLatestPhase(output: string) {
    const candidates = [
      /📋[^\n]*수집 중[^\n]*/g,
      /🔍[^\n]*중[^\n]*/g,
      /Qdrant 저장 중[^\n]*/g,
      /Neo4j 업데이트 중[^\n]*/g,
      /✅ 변경 없음[^\n]*/g,
      /🎉[^\n]*완료[^\n]*/g,
      /[^\n]*적재 완료[^\n]*/g,
      /[^\n]*동기화 완료[^\n]*/g,
    ];

    let latest: { index: number; value: string } | null = null;
    for (const pattern of candidates) {
      for (const match of output.matchAll(pattern)) {
        if (match.index === undefined) continue;
        if (!latest || match.index > latest.index) {
          latest = {
            index: match.index,
            value: match[0],
          };
        }
      }
    }

    if (!latest) return null;

    return latest.value
      .replace(/[🚀📋🔍✅🎉⚠️]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractLastNumbers(output: string, pattern: RegExp, count: number) {
    let values: number[] | null = null;
    for (const match of output.matchAll(pattern)) {
      values = Array.from({ length: count }, (_, index) => Number(match[index + 1]));
    }
    return values;
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

  private async getActiveRunId() {
    if (this.currentRunId && this.isSyncing) {
      return this.currentRunId;
    }

    const activeRun = await this.getLatestRunAggregate({ activeOnly: true });
    return activeRun?.runId ?? null;
  }

  private async getLatestRunAggregate(options?: {
    activeOnly?: boolean;
    completedOnly?: boolean;
  }): Promise<SyncRunAggregate | null> {
    const conditions: string[] = [];

    if (options?.activeOnly) {
      conditions.push(`bool_or(status IN ('RUNNING', 'PENDING')) = true`);
    }

    if (options?.completedOnly) {
      conditions.push(`bool_or(status IN ('RUNNING', 'PENDING')) = false`);
    }

    const whereClause = conditions.length > 0 ? `HAVING ${conditions.join(' AND ')}` : '';
    const rows = await this.logRepo.query(
      `
        SELECT
          "runId",
          MIN("startedAt") AS "startedAt",
          MAX("finishedAt") AS "finishedAt",
          bool_or(status IN ('RUNNING', 'PENDING')) AS "isActive",
          bool_or(status = 'FAILED') AS "hasFailure",
          COUNT(*)::int AS "totalSeeds",
          COUNT(*) FILTER (WHERE status IN ('SUCCESS', 'FAILED'))::int AS "completedSeeds"
        FROM data_sync_logs
        GROUP BY "runId"
        ${whereClause}
        ORDER BY MIN("startedAt") DESC
        LIMIT 1
      `,
    );

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const runId = String(row.runId);
    const logs = await this.logRepo.find({
      where: { runId },
      order: { orderIndex: 'ASC', startedAt: 'ASC' },
    });

    return {
      runId,
      startedAt: new Date(String(row.startedAt)),
      finishedAt: row.finishedAt ? new Date(String(row.finishedAt)) : null,
      isActive: Boolean(row.isActive),
      hasFailure: Boolean(row.hasFailure),
      totalSeeds: Number(row.totalSeeds),
      completedSeeds: Number(row.completedSeeds),
      message: logs
        .map((log) => log.summary?.trim())
        .filter((summary): summary is string => Boolean(summary))
        .join('\n') || null,
    };
  }
}
