/**
 * RAG 품질 운영 리포트.
 *
 *   pnpm --filter @welfare-ai/api run rag:quality [days]
 *
 * rag_traces.events에 쌓인 관찰 이벤트를 집계해 다음을 측정한다.
 *
 *  - 라우팅 tier 분포: [regex]/[llm_fallback]/[regex_default]/[hitl_resume]
 *    → LLM 폴백 트래픽·정확도 튜닝 근거 (INTENT_HINT 조정)
 *  - 답변 형식 준수율: '답변 형식 경고' (route별)
 *    → 프롬프트 변경 전후 비교 지표
 *  - HITL 지표: 재질문율, 재개율, 재개 후 성공율
 *    → 프로필 메모리·재개 구조의 효과 측정
 *  - 안전장치 발동: 예산 소진, 검색 재시도, 그라운딩 경고, 정정 부록
 */
import 'dotenv/config';
import { AppDataSource } from '../../../database/data-source';

interface TraceEvent {
  type?: string;
  title?: string;
  detail?: string;
  payload?: Record<string, unknown>;
}

interface TraceRow {
  id: string;
  status: string;
  route_type: string | null;
  events: TraceEvent[] | null;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function extractTier(events: TraceEvent[]): string {
  const routeEvent = events.find((e) => e?.title === '라우트 결정');
  const match = routeEvent?.detail?.match(/^\[(\w+)\]/);
  return match?.[1] ?? 'unknown';
}

async function main() {
  const days = Number(process.argv[2]);
  const windowDays = Number.isFinite(days) && days > 0 ? days : null;

  await AppDataSource.initialize();
  try {
    const where = ['1=1'];
    if (windowDays) where.push(`created_at >= NOW() - INTERVAL '${windowDays} days'`);

    const rows: TraceRow[] = await AppDataSource.query(
      `SELECT id, status, route_type, events FROM rag_traces
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC`,
    );

    const total = rows.length;
    const tierCounts = new Map<string, number>();
    const formatWarningsByRoute = new Map<string, number>();
    let formatWarned = 0;
    let hitlAsked = 0;
    let hitlRecovery = 0;
    let hitlResumed = 0;
    let hitlResumedSuccess = 0;
    let budgetExhausted = 0;
    let retrySearch = 0;
    let retrySearchRecovered = 0;
    let groundingWarned = 0;
    let corrections = 0;

    for (const row of rows) {
      const events = Array.isArray(row.events) ? row.events : [];
      const titles = new Set(events.map((e) => e?.title).filter(Boolean));

      const tier = extractTier(events);
      tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);

      if (titles.has('답변 형식 경고')) {
        formatWarned += 1;
        for (const event of events) {
          if (event?.title !== '답변 형식 경고') continue;
          const route = String(event.payload?.route ?? row.route_type ?? 'unknown');
          formatWarningsByRoute.set(route, (formatWarningsByRoute.get(route) ?? 0) + 1);
        }
      }

      if (titles.has('추가 정보 요청')) hitlAsked += 1;
      if (titles.has('검색 신뢰도 부족 — HITL 전환') || titles.has('답변 후 HITL 전환')) {
        hitlRecovery += 1;
      }
      if (titles.has('HITL 재개')) {
        hitlResumed += 1;
        if (row.status === 'SUCCESS' && !titles.has('추가 정보 요청')) {
          hitlResumedSuccess += 1;
        }
      }

      if (titles.has('도구 호출 예산 소진')) budgetExhausted += 1;
      if (titles.has('검색 재시도')) {
        retrySearch += 1;
        if (!titles.has('검색 신뢰도 부족 — HITL 전환')) retrySearchRecovered += 1;
      }
      if (titles.has('답변 그라운딩 경고')) groundingWarned += 1;
      if (titles.has('답변 정정 부록')) corrections += 1;
    }

    const lines: string[] = [];
    lines.push('=== RAG 품질 운영 리포트 ===');
    lines.push(`범위: ${windowDays ? `최근 ${windowDays}일` : '전체'} | trace ${total}건`);
    lines.push('');

    lines.push('[라우팅 tier 분포]');
    for (const [tier, count] of [...tierCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${tier.padEnd(14)} ${count}건 (${pct(count, total)})`);
    }
    lines.push('');

    lines.push('[답변 형식 준수]');
    lines.push(`  형식 경고 trace: ${formatWarned}건 (${pct(formatWarned, total)})`);
    for (const [route, count] of formatWarningsByRoute.entries()) {
      lines.push(`    - ${route}: ${count}건`);
    }
    lines.push('');

    lines.push('[HITL]');
    lines.push(`  프로필 재질문(추가 정보 요청): ${hitlAsked}건 (${pct(hitlAsked, total)})`);
    lines.push(`  복구형 HITL(신뢰도 부족·답변 후 전환): ${hitlRecovery}건 (${pct(hitlRecovery, total)})`);
    lines.push(`  HITL 재개: ${hitlResumed}건 | 재개 후 성공: ${hitlResumedSuccess}건 (${pct(hitlResumedSuccess, hitlResumed)})`);
    lines.push('');

    lines.push('[안전장치 발동]');
    lines.push(`  도구 호출 예산 소진: ${budgetExhausted}건 (${pct(budgetExhausted, total)})`);
    lines.push(`  검색 재시도: ${retrySearch}건 | 재시도로 HITL 회피: ${retrySearchRecovered}건 (${pct(retrySearchRecovered, retrySearch)})`);
    lines.push(`  그라운딩 경고: ${groundingWarned}건 (${pct(groundingWarned, total)})`);
    lines.push(`  정정 부록 발송: ${corrections}건`);

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
