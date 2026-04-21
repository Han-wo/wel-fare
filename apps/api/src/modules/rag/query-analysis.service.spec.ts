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

  it('asks for missing eligibility fields when housing conditions are not provided', () => {
    const result = service.getClarificationRequest({
      routeType: 'ELIGIBILITY',
      question: '내가 행복주택 받을 수 있어?',
      profile: null,
    });

    expect(result?.missingFields).toEqual(['income', 'housing']);
  });
});
