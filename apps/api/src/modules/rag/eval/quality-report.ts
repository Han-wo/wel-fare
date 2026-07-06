/**
 * RAG 품질 운영 리포트 (CLI).
 *
 *   pnpm --filter @welfare-ai/api run rag:quality [days]
 *
 * 집계 로직은 quality-metrics.ts 공용 — /admin/observability의
 * quality-summary API와 같은 지표를 본다.
 */
import 'dotenv/config';
import { AppDataSource } from '../../../database/data-source';
import { aggregateQualityMetrics, type QualityTraceRow } from '../quality-metrics';

function pct(part: number, whole: number): string {
  if (whole === 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

async function main() {
  const days = Number(process.argv[2]);
  const windowDays = Number.isFinite(days) && days > 0 ? days : null;

  await AppDataSource.initialize();
  try {
    const where = ['1=1'];
    if (windowDays) where.push(`created_at >= NOW() - INTERVAL '${windowDays} days'`);

    const rows: Array<{ status: string; route_type: string | null; events: QualityTraceRow['events'] }> =
      await AppDataSource.query(
        `SELECT status, route_type, events FROM rag_traces
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC`,
      );

    const m = aggregateQualityMetrics(
      rows.map((row) => ({ status: row.status, routeType: row.route_type, events: row.events })),
    );

    const lines: string[] = [];
    lines.push('=== RAG 품질 운영 리포트 ===');
    lines.push(`범위: ${windowDays ? `최근 ${windowDays}일` : '전체'} | trace ${m.total}건`);
    lines.push('');

    lines.push('[라우팅 tier 분포]');
    for (const [tier, count] of Object.entries(m.tierCounts).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${tier.padEnd(14)} ${count}건 (${pct(count, m.total)})`);
    }
    lines.push('');

    lines.push('[답변 형식 준수]');
    lines.push(`  형식 경고 trace: ${m.format.warnedTraces}건 (${pct(m.format.warnedTraces, m.total)})`);
    for (const [route, count] of Object.entries(m.format.byRoute)) {
      lines.push(`    - ${route}: ${count}건`);
    }
    lines.push('');

    lines.push('[HITL]');
    lines.push(`  프로필 재질문(추가 정보 요청): ${m.hitl.profileAsked}건 (${pct(m.hitl.profileAsked, m.total)})`);
    lines.push(`  복구형 HITL(신뢰도 부족·답변 후 전환): ${m.hitl.recovery}건 (${pct(m.hitl.recovery, m.total)})`);
    lines.push(`  HITL 재개: ${m.hitl.resumed}건 | 재개 후 성공: ${m.hitl.resumedSuccess}건 (${pct(m.hitl.resumedSuccess, m.hitl.resumed)})`);
    lines.push('');

    lines.push('[안전장치 발동]');
    lines.push(`  도구 호출 예산 소진: ${m.safeguards.budgetExhausted}건 (${pct(m.safeguards.budgetExhausted, m.total)})`);
    lines.push(`  검색 재시도: ${m.safeguards.retrySearch}건 | 재시도로 HITL 회피: ${m.safeguards.retrySearchRecovered}건 (${pct(m.safeguards.retrySearchRecovered, m.safeguards.retrySearch)})`);
    lines.push(`  그라운딩 경고: ${m.safeguards.groundingWarned}건 (${pct(m.safeguards.groundingWarned, m.total)})`);
    lines.push(`  정정 부록 발송: ${m.safeguards.corrections}건`);

    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('리포트 실패:', error);
  process.exit(1);
});
