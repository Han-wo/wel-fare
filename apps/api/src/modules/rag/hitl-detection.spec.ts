import { describe, expect, it } from '@jest/globals';
import { detectAnswerNeedsHitl } from './hitl-detection';

describe('detectAnswerNeedsHitl', () => {
  it('flags empty answers', () => {
    expect(detectAnswerNeedsHitl('')).toEqual({ needsHitl: true, reason: 'empty_answer' });
    expect(detectAnswerNeedsHitl('   ')).toEqual({ needsHitl: true, reason: 'empty_answer' });
  });

  it('flags uncertain phrasing', () => {
    expect(detectAnswerNeedsHitl('[불확실] 추가 확인이 필요합니다.').needsHitl).toBe(true);
  });

  it('flags "not found" answers as no_results (reactive net)', () => {
    expect(
      detectAnswerNeedsHitl('검색 결과에서 기초연금 관련 정책 문서를 찾을 수 없습니다.'),
    ).toEqual({ needsHitl: true, reason: 'no_results' });
    expect(
      detectAnswerNeedsHitl('관련 정책을 찾지 못했습니다. 조건을 알려주세요.').reason,
    ).toBe('no_results');
  });

  it('does not flag a normal grounded answer', () => {
    const answer = '### 📋 청년월세 지원\n- 지원내용: 월 20만원\n- 신청링크: ...';
    expect(detectAnswerNeedsHitl(answer)).toEqual({ needsHitl: false, reason: null });
  });
});
