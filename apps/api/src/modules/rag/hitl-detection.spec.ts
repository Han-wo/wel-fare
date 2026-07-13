import { describe, expect, it } from '@jest/globals';
import { detectAnswerNeedsHitl } from './hitl-detection';

describe('detectAnswerNeedsHitl', () => {
  it('flags empty answers', () => {
    expect(detectAnswerNeedsHitl('')).toEqual({ needsHitl: true, reason: 'empty_answer' });
    expect(detectAnswerNeedsHitl('   ')).toEqual({ needsHitl: true, reason: 'empty_answer' });
  });

  it('flags uncertain phrasing in short answers', () => {
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

  it('does not flag a substantial eligibility answer that starts with [불확실]', () => {
    const answer = [
      '[불확실] 나이(27세)와 거주지(경기도)는 조건에 맞으나 예술활동증명 보유 여부가 확인되지 않아 최종 적격 판정 불가.',
      '',
      '근거:',
      '- 연령: 정책 문서 연령 조건은 만 18세 ~ 만 39세입니다. 사용자 나이 27세는 해당 조건을 충족합니다.',
      '- 거주/대상: 문서에는 국내 거주 내국인 및 재외국민에 한함으로 되어 있으며, 사용자는 경기도 거주로 조건을 충족합니다.',
      '- 필수 자격: 신청자격은 예술활동증명을 완료한 예술인으로 명시되어 있습니다. 프로필에는 해당 정보가 없습니다.',
      '- 지원내용: 문서상 상품은 10만원 정액 적금, 가입기간 2년(24개월), 납입한도 월 10만원(2년 최대 240만원)이며 지원금은 만기 익월 지급으로 규정되어 있습니다.',
      '- 신청/확인 경로: 예술활동증명 유효 여부는 예술인경력정보시스템(https://www.kawfartist.kr)에서 확인할 수 있습니다.',
      '',
      '확인 필요: 예술활동증명 완료 여부 및 신청일 기준 유효 상태. 예술인경력정보시스템 접속 후 경력지원, 예술활동증명, 신청내역 순서로 확인하시면 됩니다.',
    ].join('\n');
    expect(detectAnswerNeedsHitl(answer)).toEqual({ needsHitl: false, reason: null });
  });

  it('does not flag a long grounded answer with a courteous follow-up question', () => {
    const answer = [
      '요청하신 조건에 대해 현재 신청 가능한 청년 지원 사업을 정리했습니다.',
      '- 청년월세 지원사업: 월 최대 20만원, 최장 24개월 지원.',
      '  신청링크: https://www.bokjiro.go.kr/example',
      '- 청년 전세보증금 대출: 보증금의 80%까지 저리 대출.',
      '  신청링크: https://www.hf.go.kr/example',
      '- 공공임대 수시모집: LH 청약센터에서 상시 확인 가능합니다.',
      '두 사업 모두 소득 기준을 충족하시는 것으로 보입니다. 접수 마감일이 다르니 유의하세요.',
      '더 자세히 알아보고 싶은 분야가 있다면 어느 분야인지 알려주세요.',
    ].join('\n');
    expect(detectAnswerNeedsHitl(answer)).toEqual({ needsHitl: false, reason: null });
  });

  it('flags a short answer that only re-asks with options', () => {
    const answer = [
      '질문이 넓어서 아래 중에서 골라주시면 정확히 찾아드릴게요.',
      '1. 주거 지원',
      '2. 생활비 지원',
      '3. 일자리 지원',
    ].join('\n');
    expect(detectAnswerNeedsHitl(answer)).toEqual({
      needsHitl: true,
      reason: 'reasking_with_options',
    });
  });
});
