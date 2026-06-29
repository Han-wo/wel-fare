import { describe, expect, it } from '@jest/globals';
import { QueryAnalysisService } from './query-analysis.service';

describe('QueryAnalysisService', () => {
  const service = new QueryAnalysisService();

  it('routes deadline questions to the upcoming deadline tool', () => {
    const result = service.resolveSearchPreRoute({
      question: '지금 신청 가능한 청약 공고 보여줘',
      userId: 'user-1',
      traceId: 'trace-1',
    });

    expect(result).toEqual({
      toolName: 'get_upcoming_deadlines',
      args: { userId: 'user-1', days_ahead: 14, traceId: 'trace-1' },
      detail: '정규식 규칙이 질문을 get_upcoming_deadlines로 바로 라우팅했습니다.',
    });
  });

  it('extracts named programs that the question explicitly points to', () => {
    expect(service.extractNamedPrograms('기초연금 지원 내용 알려줘')).toEqual(['기초연금']);
    expect(service.extractNamedPrograms('청년수당이랑 청년월세 둘 다 궁금해')).toEqual([
      '청년수당',
      '청년월세',
    ]);
    // 특정 정책명이 없는 일반/개인화 질문은 빈 배열 → 신뢰도 게이트가 작동하지 않는다.
    expect(service.extractNamedPrograms('내 조건에 맞는 복지 지원 추천해줘')).toEqual([]);
  });

  it('asks for missing eligibility fields when housing conditions are not provided', () => {
    const result = service.getClarificationRequest({
      routeType: 'ELIGIBILITY',
      question: '내가 행복주택 받을 수 있어?',
      profile: null,
    });

    expect(result?.missingFields).toEqual(['income', 'housing']);
  });
});
