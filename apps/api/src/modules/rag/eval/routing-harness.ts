import { QueryAnalysisService } from '../query-analysis.service';
import { ROUTING_GOLDEN, type RoutingGoldenCase } from './routing.golden';

export type RoutingVerdict = 'PASS' | 'KNOWN_GAP' | 'REGRESSION';

export interface RoutingCaseResult {
  id: string;
  question: string;
  verdict: RoutingVerdict;
  routeOk: boolean;
  preRouteOk: boolean;
  expectedRoute: string;
  actualRoute: string;
  expectedPreRouteTool?: string | null;
  actualPreRouteTool: string | null;
  knownGapReason?: string;
  mismatches: string[];
}

export interface RoutingReport {
  total: number;
  passed: number;
  knownGaps: number;
  regressions: number;
  results: RoutingCaseResult[];
}

const HARNESS_USER_ID = 'eval-user';
const HARNESS_TRACE_ID = 'eval-trace';

function evaluateCase(
  service: QueryAnalysisService,
  testCase: RoutingGoldenCase,
): RoutingCaseResult {
  const route = service.resolveRoute(testCase.question);
  const actualRoute = route.routeType;
  const routeOk = actualRoute === testCase.expectedRoute;

  const preRoute = service.resolveSearchPreRoute({
    question: testCase.question,
    userId: HARNESS_USER_ID,
    traceId: HARNESS_TRACE_ID,
  });
  const actualPreRouteTool = preRoute?.toolName ?? null;

  // 사전 라우팅은 SEARCH 라우트에서만 의미가 있다. expectedPreRouteTool이
  // undefined면 검증 대상에서 제외한다.
  const checksPreRoute = testCase.expectedPreRouteTool !== undefined;
  const preRouteOk =
    !checksPreRoute || actualPreRouteTool === testCase.expectedPreRouteTool;

  const mismatches: string[] = [];
  if (!routeOk) {
    mismatches.push(`route: expected ${testCase.expectedRoute}, got ${actualRoute}`);
  }
  if (checksPreRoute && !preRouteOk) {
    mismatches.push(
      `preRoute: expected ${testCase.expectedPreRouteTool ?? 'null'}, got ${actualPreRouteTool ?? 'null'}`,
    );
  }

  let verdict: RoutingVerdict;
  if (mismatches.length === 0) {
    verdict = 'PASS';
  } else if (testCase.knownGap) {
    verdict = 'KNOWN_GAP';
  } else {
    verdict = 'REGRESSION';
  }

  return {
    id: testCase.id,
    question: testCase.question,
    verdict,
    routeOk,
    preRouteOk,
    expectedRoute: testCase.expectedRoute,
    actualRoute,
    expectedPreRouteTool: testCase.expectedPreRouteTool,
    actualPreRouteTool,
    knownGapReason: testCase.knownGap?.reason,
    mismatches,
  };
}

export function runRoutingHarness(
  cases: RoutingGoldenCase[] = ROUTING_GOLDEN,
  service: QueryAnalysisService = new QueryAnalysisService(),
): RoutingReport {
  const results = cases.map((testCase) => evaluateCase(service, testCase));
  return {
    total: results.length,
    passed: results.filter((r) => r.verdict === 'PASS').length,
    knownGaps: results.filter((r) => r.verdict === 'KNOWN_GAP').length,
    regressions: results.filter((r) => r.verdict === 'REGRESSION').length,
    results,
  };
}

export function formatRoutingReport(report: RoutingReport): string {
  const lines: string[] = [];
  lines.push('=== Routing Eval Harness ===');
  lines.push(
    `total ${report.total} | pass ${report.passed} | known-gap ${report.knownGaps} | regression ${report.regressions}`,
  );
  lines.push('');

  const icon = (v: RoutingVerdict) =>
    v === 'PASS' ? '✓' : v === 'KNOWN_GAP' ? '~' : '✗';

  for (const r of report.results) {
    lines.push(`${icon(r.verdict)} [${r.verdict}] ${r.id} — "${r.question}"`);
    for (const m of r.mismatches) {
      lines.push(`    ↳ ${m}`);
    }
    if (r.verdict === 'KNOWN_GAP' && r.knownGapReason) {
      lines.push(`    ↳ gap: ${r.knownGapReason}`);
    }
  }

  return lines.join('\n');
}
