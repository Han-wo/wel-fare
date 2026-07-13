import { describe, expect, it } from '@jest/globals';
import { isLikelyFollowUp } from './follow-up-detection';

describe('isLikelyFollowUp', () => {
  it('requires history', () => {
    expect(isLikelyFollowUp('그럼 두 번째 정책은?', false)).toBe(false);
  });

  it('detects anaphora phrases', () => {
    expect(isLikelyFollowUp('그럼 두 번째 정책은 조건이 어떻게 돼?', true)).toBe(true);
    expect(isLikelyFollowUp('아까 말한 지원금 신청 방법 알려줘', true)).toBe(true);
    expect(isLikelyFollowUp('그거 마감 언제야?', true)).toBe(true);
    expect(isLikelyFollowUp('마지막 정책 링크 줘', true)).toBe(true);
    expect(isLikelyFollowUp('이 정책 나도 받을 수 있어?', true)).toBe(true);
  });

  it('treats very short questions as follow-ups', () => {
    expect(isLikelyFollowUp('조건은?', true)).toBe(true);
    expect(isLikelyFollowUp('링크 줘', true)).toBe(true);
    expect(isLikelyFollowUp('왜?', true)).toBe(true);
  });

  it('leaves standalone questions alone', () => {
    expect(isLikelyFollowUp('서울 청년이 신청 가능한 월세 지원 알려줘', true)).toBe(false);
    expect(isLikelyFollowUp('경기도 무주택 1인 가구 주거 지원 정리해줘', true)).toBe(false);
    expect(isLikelyFollowUp('청년도약계좌 자격 조건이 어떻게 되나요?', true)).toBe(false);
  });

  it('ignores empty input', () => {
    expect(isLikelyFollowUp('   ', true)).toBe(false);
  });
});
