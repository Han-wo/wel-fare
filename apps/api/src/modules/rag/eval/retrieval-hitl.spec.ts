import { describe, expect, it } from '@jest/globals';
import { QueryAnalysisService } from '../query-analysis.service';
import { assessNamedProgramCoverage } from '../retrieval-confidence';
import { RETRIEVAL_HITL_GOLDEN } from './retrieval-hitl.golden';

describe('Retrieval HITL gate (entity-absence) harness', () => {
  const queryAnalysis = new QueryAnalysisService();

  const results = RETRIEVAL_HITL_GOLDEN.map((testCase) => {
    const namedPrograms = queryAnalysis.extractNamedPrograms(testCase.question);
    const assessment = assessNamedProgramCoverage(namedPrograms, testCase.docs);
    return {
      ...testCase,
      actualLowConfidence: assessment.lowConfidence,
      assessment,
      ok: assessment.lowConfidence === testCase.expectLowConfidence,
    };
  });

  it('covers every golden case exactly once', () => {
    const ids = RETRIEVAL_HITL_GOLDEN.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches the expected gate decision on every golden case', () => {
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      const report = failures
        .map(
          (f) =>
            `✗ ${f.id} ("${f.question}") — expected lowConfidence=${f.expectLowConfidence}, ` +
            `got ${f.actualLowConfidence} (matched=[${f.assessment.matched}], missing=[${f.assessment.missing}])`,
        )
        .join('\n');
      throw new Error(`Retrieval HITL gate 회귀:\n${report}`);
    }
    expect(failures.length).toBe(0);
  });

  it.each(RETRIEVAL_HITL_GOLDEN.map((c) => [c.id, c.expectLowConfidence] as [string, boolean]))(
    'classifies %s correctly (expect lowConfidence=%s)',
    (id: string) => {
      const result = results.find((r) => r.id === id);
      expect(result?.ok).toBe(true);
    },
  );

  // 추적에서 발견한 핵심 정밀도 보증: 우발적 본문 언급은 엔티티 존재로 보지 않는다.
  it('does not count incidental in-content mentions as entity presence', () => {
    const assessment = assessNamedProgramCoverage(
      ['기초연금'],
      [{ title: '전기요금 복지할인', content: '[정책명] 전기요금 복지할인 [개요] 기초연금 수급자도 신청 가능' }],
    );
    expect(assessment.lowConfidence).toBe(true);
  });
});
