import { describe, expect, it } from '@jest/globals';
import {
  APPLICATION_ASSIST_SYSTEM_PROMPT,
  BUDGET_EXHAUSTED_INSTRUCTION,
  ELIGIBILITY_SYSTEM_PROMPT,
  ROUTER_FALLBACK_SYSTEM_PROMPT,
  SEARCH_SYSTEM_PROMPT,
} from './prompts';

/**
 * 프롬프트 계약 스펙.
 *
 * 답변 형식 체커(answer-format.ts)·프론트 파서·trace 집계가 의존하는
 * 프롬프트의 핵심 마커가 수정 중 실수로 사라지지 않게 잠근다.
 * 문구 전체를 잠그는 게 아니라 계약(태그·마커·도구 목록)만 잠근다.
 */
describe('prompt contracts', () => {
  it('SEARCH 프롬프트는 7개 도구를 전부 언급한다', () => {
    const tools = [
      'search_welfare',
      'search_youth_policy',
      'search_housing_subscription',
      'search_rental_support',
      'search_welfare_facility',
      'check_policy_eligibility',
      'get_upcoming_deadlines',
    ];
    for (const tool of tools) {
      expect(SEARCH_SYSTEM_PROMPT).toContain(tool);
    }
  });

  it('SEARCH 프롬프트는 답변 형식 마커(📋, 핵심 요약)를 정의한다', () => {
    expect(SEARCH_SYSTEM_PROMPT).toContain('📋 [정책명]');
    expect(SEARCH_SYSTEM_PROMPT).toContain('핵심 요약');
  });

  it('ELIGIBILITY 프롬프트는 세 판정 태그를 전부 정의한다', () => {
    expect(ELIGIBILITY_SYSTEM_PROMPT).toContain('[가능]');
    expect(ELIGIBILITY_SYSTEM_PROMPT).toContain('[불확실]');
    expect(ELIGIBILITY_SYSTEM_PROMPT).toContain('[어려움]');
    expect(ELIGIBILITY_SYSTEM_PROMPT).toContain('첫 줄');
  });

  it('APPLICATION_ASSIST 프롬프트는 실행 가이드 구조 마커를 정의한다', () => {
    expect(APPLICATION_ASSIST_SYSTEM_PROMPT).toContain('신청 순서');
    expect(APPLICATION_ASSIST_SYSTEM_PROMPT).toContain('준비 서류');
    expect(APPLICATION_ASSIST_SYSTEM_PROMPT).toContain('바로 할 일');
    expect(APPLICATION_ASSIST_SYSTEM_PROMPT).toContain('공고문 확인 필요');
  });

  it('라우터 폴백 프롬프트는 세 라우트를 전부 정의한다', () => {
    expect(ROUTER_FALLBACK_SYSTEM_PROMPT).toContain('SEARCH');
    expect(ROUTER_FALLBACK_SYSTEM_PROMPT).toContain('ELIGIBILITY');
    expect(ROUTER_FALLBACK_SYSTEM_PROMPT).toContain('APPLICATION_ASSIST');
    // 애매할 때의 기본값 지시는 폴백 안전성의 핵심 계약이다.
    expect(ROUTER_FALLBACK_SYSTEM_PROMPT).toContain('애매하면 SEARCH');
  });

  it('시스템 프롬프트는 동적 값 없이 정적이다 (prompt caching 계약)', () => {
    // 템플릿 잔재(${)가 프롬프트 문자열에 남아 있으면 캐싱 계약 위반 신호다.
    for (const prompt of [
      SEARCH_SYSTEM_PROMPT,
      ELIGIBILITY_SYSTEM_PROMPT,
      APPLICATION_ASSIST_SYSTEM_PROMPT,
      ROUTER_FALLBACK_SYSTEM_PROMPT,
      BUDGET_EXHAUSTED_INSTRUCTION,
    ]) {
      expect(prompt).not.toContain('${');
    }
  });
});
