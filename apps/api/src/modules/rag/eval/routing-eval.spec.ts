import { describe, expect, it } from '@jest/globals';
import { ROUTING_GOLDEN } from './routing.golden';
import { runRoutingHarness, formatRoutingReport } from './routing-harness';

describe('Routing eval harness', () => {
  const report = runRoutingHarness();

  it('has no unexpected regressions against the golden dataset', () => {
    const regressions = report.results.filter((r) => r.verdict === 'REGRESSION');
    // 회귀가 있으면 사람이 읽을 수 있는 전체 리포트를 에러 메시지로 노출한다.
    if (regressions.length > 0) {
      throw new Error(`라우팅 회귀 감지:\n${formatRoutingReport(report)}`);
    }
    expect(regressions.length).toBe(0);
  });

  it('covers every golden case exactly once', () => {
    const ids = ROUTING_GOLDEN.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(report.total).toBe(ROUTING_GOLDEN.length);
  });

  // 데이터셋의 각 케이스를 개별 테스트로도 노출해 어떤 케이스가 어떤 분류인지
  // 테스트 러너에서 바로 보이게 한다. KNOWN_GAP은 통과로 취급한다.
  it.each(ROUTING_GOLDEN.map((c) => [c.id, c.question] as [string, string]))(
    'classifies %s ("%s") as PASS or KNOWN_GAP',
    (id: string) => {
      const result = report.results.find((r) => r.id === id);
      expect(result).toBeDefined();
      expect(['PASS', 'KNOWN_GAP']).toContain(result?.verdict);
    },
  );
});
