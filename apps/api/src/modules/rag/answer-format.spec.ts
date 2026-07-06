import { describe, expect, it } from '@jest/globals';
import {
  checkApplicationAnswerFormat,
  checkEligibilityAnswerFormat,
  checkSearchAnswerFormat,
} from './answer-format';

describe('checkSearchAnswerFormat', () => {
  it('정책 블록이 있으면 핵심 요약 줄을 요구한다', () => {
    const withSummary =
      '### 📋 [청년월세 지원]\n- **지원내용**: 월 20만원\n\n💡 **핵심 요약**: 신청 가능';
    expect(checkSearchAnswerFormat(withSummary).compliant).toBe(true);

    const withoutSummary = '### 📋 [청년월세 지원]\n- **지원내용**: 월 20만원';
    const result = checkSearchAnswerFormat(withoutSummary);
    expect(result.compliant).toBe(false);
    expect(result.violations).toContain('핵심 요약 줄 없음');
  });

  it('정책 블록이 없는 답변(못 찾음 안내 등)은 검사하지 않는다', () => {
    expect(checkSearchAnswerFormat('관련 정책을 찾지 못했습니다.').compliant).toBe(true);
    expect(checkSearchAnswerFormat('').compliant).toBe(true);
  });
});

describe('checkEligibilityAnswerFormat', () => {
  it('첫 줄이 판정 태그로 시작하면 통과', () => {
    expect(checkEligibilityAnswerFormat('[가능] 조건을 충족합니다.\n근거: ...').compliant).toBe(true);
    expect(checkEligibilityAnswerFormat('\n[불확실] 소득 확인이 필요합니다.').compliant).toBe(true);
    expect(checkEligibilityAnswerFormat('[어려움] 연령 조건과 충돌합니다.').compliant).toBe(true);
  });

  it('판정 태그 없이 시작하면 위반', () => {
    const result = checkEligibilityAnswerFormat('청년월세는 만 19~34세 대상입니다.');
    expect(result.compliant).toBe(false);
  });
});

describe('checkApplicationAnswerFormat', () => {
  it('신청 순서와 바로 할 일이 있으면 통과', () => {
    const guide = '**신청 대상**: ...\n**신청 순서**:\n1. 복지로 접속\n\n**바로 할 일**: 서류 준비';
    expect(checkApplicationAnswerFormat(guide).compliant).toBe(true);
  });

  it('구조 마커가 빠지면 위반 항목을 나열한다', () => {
    const result = checkApplicationAnswerFormat('그냥 복지로에서 신청하면 됩니다.');
    expect(result.compliant).toBe(false);
    expect(result.violations).toEqual(['신청 순서 없음', '바로 할 일 없음']);
  });
});
