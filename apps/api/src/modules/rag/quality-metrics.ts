/**
 * RAG 품질 지표 집계의 순수 로직.
 *
 * rag_traces.events의 관찰 이벤트를 지표로 변환한다.
 * 소비자 둘: eval/quality-report.ts(CLI 리포트), RagTraceService의
 * 관리자 quality-summary API(/admin/observability 카드).
 */

export interface QualityTraceRow {
  status: string;
  routeType: string | null;
  events: Array<{ type?: string; title?: string; detail?: string; payload?: Record<string, unknown> }> | null;
}

export interface QualityMetrics {
  total: number;
  tierCounts: Record<string, number>;
  format: {
    warnedTraces: number;
    byRoute: Record<string, number>;
  };
  hitl: {
    profileAsked: number;
    recovery: number;
    resumed: number;
    resumedSuccess: number;
  };
  safeguards: {
    budgetExhausted: number;
    retrySearch: number;
    retrySearchRecovered: number;
    groundingWarned: number;
    corrections: number;
  };
}

function extractTier(events: NonNullable<QualityTraceRow['events']>): string {
  const routeEvent = events.find((e) => e?.title === '라우트 결정');
  const match = routeEvent?.detail?.match(/^\[(\w+)\]/);
  return match?.[1] ?? 'unknown';
}

export function aggregateQualityMetrics(rows: QualityTraceRow[]): QualityMetrics {
  const metrics: QualityMetrics = {
    total: rows.length,
    tierCounts: {},
    format: { warnedTraces: 0, byRoute: {} },
    hitl: { profileAsked: 0, recovery: 0, resumed: 0, resumedSuccess: 0 },
    safeguards: {
      budgetExhausted: 0,
      retrySearch: 0,
      retrySearchRecovered: 0,
      groundingWarned: 0,
      corrections: 0,
    },
  };

  for (const row of rows) {
    const events = Array.isArray(row.events) ? row.events : [];
    const titles = new Set(events.map((e) => e?.title).filter(Boolean));

    const tier = extractTier(events);
    metrics.tierCounts[tier] = (metrics.tierCounts[tier] ?? 0) + 1;

    if (titles.has('답변 형식 경고')) {
      metrics.format.warnedTraces += 1;
      for (const event of events) {
        if (event?.title !== '답변 형식 경고') continue;
        const route = String(event.payload?.route ?? row.routeType ?? 'unknown');
        metrics.format.byRoute[route] = (metrics.format.byRoute[route] ?? 0) + 1;
      }
    }

    if (titles.has('추가 정보 요청')) metrics.hitl.profileAsked += 1;
    if (titles.has('검색 신뢰도 부족 — HITL 전환') || titles.has('답변 후 HITL 전환')) {
      metrics.hitl.recovery += 1;
    }
    if (titles.has('HITL 재개')) {
      metrics.hitl.resumed += 1;
      if (row.status === 'SUCCESS' && !titles.has('추가 정보 요청')) {
        metrics.hitl.resumedSuccess += 1;
      }
    }

    if (titles.has('도구 호출 예산 소진')) metrics.safeguards.budgetExhausted += 1;
    if (titles.has('검색 재시도')) {
      metrics.safeguards.retrySearch += 1;
      if (!titles.has('검색 신뢰도 부족 — HITL 전환')) {
        metrics.safeguards.retrySearchRecovered += 1;
      }
    }
    if (titles.has('답변 그라운딩 경고')) metrics.safeguards.groundingWarned += 1;
    if (titles.has('답변 정정 부록')) metrics.safeguards.corrections += 1;
  }

  return metrics;
}
