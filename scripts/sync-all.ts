/**
 * 전체 DB 병렬 동기화 스크립트
 * 모든 시드를 병렬로 실행하여 Qdrant + Neo4j 동기화
 *
 * 실행: npx ts-node -r dotenv/config --transpile-only scripts/sync-all.ts
 * (apps/api/.env 로드를 위해 welfare-ai 루트에서 실행)
 */
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const SEED_DIR = path.resolve(__dirname, '../apps/api/src/database/seeds');
const ENV_FILE = path.resolve(__dirname, '../apps/api/.env');

interface SeedTask {
  name: string;
  script: string;
}

const SEEDS: SeedTask[] = [
  { name: '중앙부처 복지서비스',   script: 'welfare-api.seed.ts' },
  { name: '지자체 복지서비스',     script: 'local-welfare.seed.ts' },
  { name: '공공임대주택 단지',     script: 'rental-housing.seed.ts' },
  { name: '사회복지시설',          script: 'welfare-facility.seed.ts' },
  { name: '공공주택 모집공고',     script: 'housing-announcement.seed.ts' },
  { name: '청약홈 분양정보',       script: 'applyhome.seed.ts' },
  { name: '청약 경쟁률',           script: 'applyhome-cmpet.seed.ts' },
  { name: '청약 통계',             script: 'applyhome-stat.seed.ts' },
];

function runSeed(task: SeedTask): Promise<{ name: string; success: boolean; output: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(SEED_DIR, task.script);
    if (!fs.existsSync(scriptPath)) {
      resolve({ name: task.name, success: false, output: `스크립트 없음: ${scriptPath}` });
      return;
    }

    const tsNodeBin = path.resolve(__dirname, '../node_modules/.bin/ts-node');
    const cmd = fs.existsSync(tsNodeBin) ? tsNodeBin : 'npx ts-node';

    const proc = spawn(
      'npx',
      ['ts-node', '-r', 'dotenv/config', '--transpile-only', scriptPath],
      {
        cwd: path.resolve(__dirname, '../apps/api'),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const chunks: string[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(d.toString()));
    proc.stderr.on('data', (d: Buffer) => {
      const msg = d.toString();
      if (!msg.includes('ExperimentalWarning') && !msg.includes('DeprecationWarning')) {
        chunks.push(`[STDERR] ${msg}`);
      }
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ name: task.name, success: false, output: '타임아웃 (30분)' });
    }, 30 * 60 * 1000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const output = chunks.join('').trim();
      const lastLine = output.split('\n').filter(Boolean).pop() ?? '';
      resolve({ name: task.name, success: code === 0, output: lastLine || output.slice(-200) });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ name: task.name, success: false, output: err.message });
    });
  });
}

async function main() {
  const startTime = Date.now();
  console.log('🚀 전체 DB 병렬 동기화 시작');
  console.log(`   시드 목록: ${SEEDS.map(s => s.name).join(', ')}\n`);

  // 모든 시드를 병렬로 실행
  const results = await Promise.all(SEEDS.map(runSeed));

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n\n═══════════════════════════════════════');
  console.log(`  동기화 결과 (${elapsed}초 소요)`);
  console.log('═══════════════════════════════════════');
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}: ${r.output}`);
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  console.log('═══════════════════════════════════════');
  console.log(`  성공: ${successCount}개 / 실패: ${failCount}개`);

  if (failCount > 0) {
    console.log('\n  실패한 시드:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`    - ${r.name}: ${r.output}`);
    });
    process.exit(1);
  }
}

main().catch(err => {
  console.error('동기화 실패:', err);
  process.exit(1);
});
