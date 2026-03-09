import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class DataSyncService {
  private readonly logger = new Logger(DataSyncService.name);
  private isSyncing = false;
  private lastSyncAt: Date | null = null;
  private lastSyncResult: { success: boolean; message: string } | null = null;

  private readonly qdrant: QdrantClient;
  private readonly neo4jDriver: ReturnType<typeof neo4j.driver>;
  private readonly collection: string;
  private readonly seedDir: string;

  constructor(private readonly config: ConfigService) {
    this.qdrant = new QdrantClient({ url: config.get('QDRANT_URL', 'http://localhost:6333') });
    this.neo4jDriver = neo4j.driver(
      config.get('NEO4J_URI', 'bolt://localhost:7687'),
      neo4j.auth.basic(
        config.get('NEO4J_USERNAME', 'neo4j'),
        config.get('NEO4J_PASSWORD', 'welfare_neo4j_pass'),
      ),
    );
    this.collection = config.get('QDRANT_COLLECTION', 'welfare_policies');
    this.seedDir = path.resolve(__dirname, '../../../database/seeds');
  }

  // ── 새벽 2시 매일 자동 동기화 ────────────────────────────
  @Cron('0 2 * * *', { name: 'daily-data-sync', timeZone: 'Asia/Seoul' })
  async scheduledSync() {
    this.logger.log('⏰ 자동 데이터 동기화 시작');
    await this.runSync();
  }

  // ── 수동 트리거 ──────────────────────────────────────────
  async runSync(): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) {
      return { success: false, message: '이미 동기화 진행 중입니다.' };
    }
    this.isSyncing = true;

    const seeds = [
      { name: '중앙부처 복지서비스', script: 'welfare-api.seed.ts' },
      { name: '지자체 복지서비스', script: 'local-welfare.seed.ts' },
      { name: '공공임대주택 단지', script: 'rental-housing.seed.ts' },
      { name: '사회복지시설', script: 'welfare-facility.seed.ts' },
      { name: '공공주택 모집공고', script: 'housing-announcement.seed.ts' },
      { name: '청약홈 분양정보', script: 'applyhome.seed.ts' },
      { name: '청약 경쟁률', script: 'applyhome-cmpet.seed.ts' },
      { name: '청약 통계', script: 'applyhome-stat.seed.ts' },
    ];

    const results: string[] = [];
    try {
      for (const seed of seeds) {
        this.logger.log(`  🌱 ${seed.name} 동기화 중...`);
        const scriptPath = path.join(this.seedDir, seed.script);
        try {
          const { stdout, stderr } = await execAsync(
            `npx ts-node -r dotenv/config --transpile-only ${scriptPath}`,
            {
              cwd: path.resolve(__dirname, '../../../../'),
              env: { ...process.env },
              timeout: 30 * 60 * 1000, // 30분 타임아웃
            },
          );
          if (stderr && !stderr.includes('ExperimentalWarning')) {
            this.logger.warn(`  ⚠️  ${seed.name}: ${stderr.slice(0, 200)}`);
          }
          const lastLine = stdout.trim().split('\n').pop() ?? '';
          results.push(`✅ ${seed.name}: ${lastLine}`);
          this.logger.log(`  ✅ ${seed.name} 완료`);
        } catch (e) {
          const msg = (e as Error).message.slice(0, 200);
          results.push(`❌ ${seed.name}: ${msg}`);
          this.logger.error(`  ❌ ${seed.name} 실패: ${msg}`);
        }
      }

      const message = results.join('\n');
      this.lastSyncResult = { success: true, message };
      this.lastSyncAt = new Date();
      this.logger.log('🎉 전체 데이터 동기화 완료');
      return { success: true, message };
    } finally {
      this.isSyncing = false;
    }
  }

  // ── Qdrant 상태 조회 ─────────────────────────────────────
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

  // ── Neo4j 상태 조회 ──────────────────────────────────────
  async getNeo4jStats(): Promise<Record<string, unknown>> {
    const session = this.neo4jDriver.session();
    try {
      // 레이블별 노드 수
      const labelRes = await session.run(`
        CALL apoc.meta.stats()
        YIELD labels
        RETURN labels
      `).catch(() => null);

      let labelCounts: Record<string, number> = {};
      if (labelRes && labelRes.records.length > 0) {
        const raw = labelRes.records[0].get('labels') as Record<string, unknown>;
        // Neo4j Integer 객체 → 일반 number 변환
        for (const [k, v] of Object.entries(raw)) {
          const n = typeof v === 'object' && v !== null && 'toNumber' in v
            ? (v as { toNumber: () => number }).toNumber()
            : Number(v);
          if (n > 0) labelCounts[k] = n;
        }
      } else {
        // apoc 없으면 직접 쿼리
        const labels = ['Policy', 'WelfareFacility', 'HousingComplex', 'HousingAnnouncement',
                        'LifeStage', 'Theme', 'TargetGroup', 'Region', 'FacilityKind', 'Institution'];
        for (const label of labels) {
          const r = await session.run(`MATCH (n:${label}) RETURN count(n) AS cnt`);
          const cnt = r.records[0]?.get('cnt')?.toNumber?.() ?? 0;
          if (cnt > 0) labelCounts[label] = cnt;
        }
      }

      // 관계 수
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
}
