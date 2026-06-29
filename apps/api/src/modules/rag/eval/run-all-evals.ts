/**
 * RAG 하네스 통합 러너.
 *
 *   pnpm --filter @welfare-ai/api run eval
 *
 * 세 개의 골든셋 하네스(라우팅 / retrieval-HITL / 답변 그라운딩)를 한 번에
 * 돌려 사람이 읽는 통합 리포트를 출력한다. 회귀가 하나라도 있으면 종료 코드 1
 * 로 끝나 CI에서 실패로 잡힌다. 라우팅의 KNOWN_GAP은 빌드를 깨지 않는다.
 */
import { runRoutingHarness } from './routing-harness';
import { QueryAnalysisService } from '../query-analysis.service';
import { assessNamedProgramCoverage } from '../retrieval-confidence';
import { RETRIEVAL_HITL_GOLDEN } from './retrieval-hitl.golden';
import { checkAnswerGrounding } from '../answer-grounding';
import { ANSWER_GROUNDING_GOLDEN } from './answer-grounding.golden';

interface SuiteResult {
  name: string;
  total: number;
  passed: number;
  failures: string[];
  note?: string;
}

function runRoutingSuite(): SuiteResult {
  const report = runRoutingHarness();
  const failures = report.results
    .filter((r) => r.verdict === 'REGRESSION')
    .map((r) => `${r.id}: ${r.mismatches.join('; ')}`);
  return {
    name: '라우팅 (routing)',
    total: report.total,
    passed: report.passed + report.knownGaps,
    failures,
    note: `known-gap ${report.knownGaps}`,
  };
}

function runRetrievalHitlSuite(): SuiteResult {
  const queryAnalysis = new QueryAnalysisService();
  const failures: string[] = [];
  for (const testCase of RETRIEVAL_HITL_GOLDEN) {
    const programs = queryAnalysis.extractNamedPrograms(testCase.question);
    const assessment = assessNamedProgramCoverage(programs, testCase.docs);
    if (assessment.lowConfidence !== testCase.expectLowConfidence) {
      failures.push(
        `${testCase.id}: expected lowConfidence=${testCase.expectLowConfidence}, got ${assessment.lowConfidence}`,
      );
    }
  }
  return {
    name: '검색 신뢰도 HITL (retrieval-hitl)',
    total: RETRIEVAL_HITL_GOLDEN.length,
    passed: RETRIEVAL_HITL_GOLDEN.length - failures.length,
    failures,
  };
}

function runGroundingSuite(): SuiteResult {
  const failures: string[] = [];
  for (const testCase of ANSWER_GROUNDING_GOLDEN) {
    const result = checkAnswerGrounding(testCase.answer, testCase.docs);
    if (result.grounded !== testCase.expectGrounded) {
      failures.push(
        `${testCase.id}: expected grounded=${testCase.expectGrounded}, got ${result.grounded} ` +
          `(ungrounded links=[${result.ungrounded.links}], policyNames=[${result.ungrounded.policyNames}])`,
      );
    }
  }
  return {
    name: '답변 그라운딩 (answer-grounding)',
    total: ANSWER_GROUNDING_GOLDEN.length,
    passed: ANSWER_GROUNDING_GOLDEN.length - failures.length,
    failures,
  };
}

function main() {
  const suites = [runRoutingSuite(), runRetrievalHitlSuite(), runGroundingSuite()];

  const lines: string[] = ['=== WelfareAI RAG Eval Harnesses ===', ''];
  let totalFailures = 0;

  for (const suite of suites) {
    const icon = suite.failures.length === 0 ? '✓' : '✗';
    const extra = suite.note ? ` | ${suite.note}` : '';
    lines.push(`${icon} ${suite.name}: ${suite.passed}/${suite.total} pass${extra}`);
    for (const failure of suite.failures) {
      lines.push(`    ↳ ${failure}`);
    }
    totalFailures += suite.failures.length;
  }

  const grandTotal = suites.reduce((sum, s) => sum + s.total, 0);
  const grandPass = suites.reduce((sum, s) => sum + s.passed, 0);
  lines.push('', `합계: ${grandPass}/${grandTotal} pass | 회귀 ${totalFailures}`);

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));

  if (totalFailures > 0) {
    process.exit(1);
  }
}

main();
