import { describe, expect, it } from '@jest/globals';
import type { UserProfile } from '@welfare-ai/shared-types';
import {
  formatHitlFactsLine,
  parseSupplementFacts,
  type ProfileWithFacts,
} from './profile-facts';
import { QueryAnalysisService } from './query-analysis.service';

describe('parseSupplementFacts', () => {
  it('패널 합성 답변의 라벨 세그먼트를 파싱한다', () => {
    expect(parseSupplementFacts('지역: 서울, 나이대: 30대')).toEqual({
      region: '서울',
      age: '30대',
    });
    expect(parseSupplementFacts('소득: 중위소득 80% 이하, 주거: 월세 거주')).toEqual({
      income: '중위소득 80% 이하',
      housing: '월세 거주',
    });
  });

  it('정책명/분야 등 질문 단위 라벨은 지속 사실로 저장하지 않는다', () => {
    expect(parseSupplementFacts('정책명: 청년월세, 분야: 주거')).toEqual({});
  });

  it('라벨 없는 자유 입력은 패턴으로 추출한다', () => {
    expect(parseSupplementFacts('만 27세고 서울 살아요')).toEqual({
      age: '만 27세',
      region: '서울',
    });
    expect(parseSupplementFacts('무주택이고 차상위예요')).toEqual({
      housing: '무주택',
      income: '차상위',
    });
  });

  it('빈 문자열이나 매칭 없는 입력은 빈 객체', () => {
    expect(parseSupplementFacts('')).toEqual({});
    expect(parseSupplementFacts('그냥 다시 찾아줘')).toEqual({});
  });
});

describe('formatHitlFactsLine', () => {
  it('사실이 있으면 컨텍스트 한 줄을 만든다', () => {
    const profile = { hitlFacts: { region: '서울', age: '30대' } } as unknown as ProfileWithFacts;
    expect(formatHitlFactsLine(profile)).toBe('- 이전 대화에서 확인한 정보: 지역 서울 · 나이대 30대');
  });

  it('사실이 없으면 null', () => {
    expect(formatHitlFactsLine(null)).toBeNull();
    expect(formatHitlFactsLine({} as UserProfile)).toBeNull();
  });
});

describe('getClarificationRequest + hitlFacts', () => {
  const service = new QueryAnalysisService();

  it('이전 대화에서 확인된 필드는 재질문하지 않는다', () => {
    // 나이만 요구하는 청년 자격 질문 — 프로필은 비었지만 facts.age가 있다.
    const question = '청년 지원 자격이 되나 궁금해요';

    const withoutFacts = service.getClarificationRequest({
      routeType: 'ELIGIBILITY',
      question,
      profile: {} as UserProfile,
    });
    expect(withoutFacts?.missingFields).toContain('age');

    const withFacts = service.getClarificationRequest({
      routeType: 'ELIGIBILITY',
      question,
      profile: { hitlFacts: { age: '20대', income: '중위소득 80% 이하' } } as unknown as ProfileWithFacts,
    });
    expect(withFacts?.missingFields ?? []).not.toContain('age');
    expect(withFacts?.missingFields ?? []).not.toContain('income');
  });
});
