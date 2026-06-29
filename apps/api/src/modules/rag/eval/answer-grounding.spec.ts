import { describe, expect, it } from '@jest/globals';
import { checkAnswerGrounding } from '../answer-grounding';
import { ANSWER_GROUNDING_GOLDEN } from './answer-grounding.golden';

describe('Answer grounding harness', () => {
  const results = ANSWER_GROUNDING_GOLDEN.map((testCase) => ({
    ...testCase,
    result: checkAnswerGrounding(testCase.answer, testCase.docs),
  }));

  it('covers every golden case exactly once', () => {
    const ids = ANSWER_GROUNDING_GOLDEN.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches the expected grounded verdict on every golden case', () => {
    const failures = results.filter((r) => r.result.grounded !== r.expectGrounded);
    if (failures.length > 0) {
      const report = failures
        .map(
          (f) =>
            `✗ ${f.id} — expected grounded=${f.expectGrounded}, got ${f.result.grounded} ` +
            `(ungrounded links=[${f.result.ungrounded.links}], policyNames=[${f.result.ungrounded.policyNames}])`,
        )
        .join('\n');
      throw new Error(`Answer grounding 회귀:\n${report}`);
    }
    expect(failures.length).toBe(0);
  });

  it('reports the expected ungrounded claims where specified', () => {
    for (const { id, expectUngrounded, result } of results) {
      if (!expectUngrounded) continue;
      if (expectUngrounded.links) {
        expect(result.ungrounded.links).toEqual(expectUngrounded.links);
      }
      if (expectUngrounded.policyNames) {
        expect(result.ungrounded.policyNames).toEqual(expectUngrounded.policyNames);
      }
      if (expectUngrounded.amounts) {
        expect(result.ungrounded.amounts).toEqual(expectUngrounded.amounts);
      }
    }
  });

  it('flags a hallucinated apply link as ungrounded (highest-risk case)', () => {
    const result = checkAnswerGrounding(
      '신청링크: [여기](https://phishing.example.com/x)',
      [{ content: '[신청링크] https://www.bokjiro.go.kr/real' }],
    );
    expect(result.grounded).toBe(false);
    expect(result.ungrounded.links).toContain('https://phishing.example.com/x');
  });
});
