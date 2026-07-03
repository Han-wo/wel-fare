import { describe, expect, it, jest } from '@jest/globals';
import { QueryAnalysisService } from './query-analysis.service';
import type { RouteFallbackClassifier, RouteFallbackResult } from './route-fallback';

function stubClassifier(result: RouteFallbackResult | null) {
  const classify = jest.fn(() => Promise.resolve(result));
  const classifier: RouteFallbackClassifier = { classify };
  return { classifier, classify };
}

describe('QueryAnalysisService.resolveRouteSmart (2단 라우팅)', () => {
  it('정규식이 확신한 ELIGIBILITY는 폴백을 호출하지 않는다', async () => {
    const { classifier, classify } = stubClassifier({
      routeType: 'SEARCH',
      reason: 'should not be used',
    });
    const service = new QueryAnalysisService(classifier);

    const decision = await service.resolveRouteSmart('청년월세 받을 수 있어?');

    expect(decision.routeType).toBe('ELIGIBILITY');
    expect(decision.tier).toBe('regex');
    expect(classify).not.toHaveBeenCalled();
  });

  it('힌트 없는 단순 검색 질문은 폴백 없이 SEARCH', async () => {
    const { classifier, classify } = stubClassifier(null);
    const service = new QueryAnalysisService(classifier);

    const decision = await service.resolveRouteSmart('행복주택이 뭐야?');

    expect(decision.routeType).toBe('SEARCH');
    expect(decision.tier).toBe('regex');
    expect(classify).not.toHaveBeenCalled();
  });

  it('pre-route 규칙이 도구를 확정한 질문은 힌트 단어가 있어도 폴백에 보내지 않는다', async () => {
    const { classifier, classify } = stubClassifier(null);
    const service = new QueryAnalysisService(classifier);

    // '신청'은 INTENT_HINT지만 CLEAR_DEADLINE pre-route가 확정하는 fast path다.
    const decision = await service.resolveRouteSmart('지금 신청 가능한 청약 공고 보여줘');

    expect(decision.routeType).toBe('SEARCH');
    expect(decision.tier).toBe('regex');
    expect(classify).not.toHaveBeenCalled();
  });

  it('의도 힌트만 있는 애매한 질문은 폴백 분류 결과를 따른다', async () => {
    const { classifier, classify } = stubClassifier({
      routeType: 'ELIGIBILITY',
      reason: '본인 가입 가능 여부를 묻는 질문',
    });
    const service = new QueryAnalysisService(classifier);

    const decision = await service.resolveRouteSmart('복지 혜택 더 받으려면 어떻게 해야 해?');

    expect(classify).toHaveBeenCalledWith('복지 혜택 더 받으려면 어떻게 해야 해?');
    expect(decision.routeType).toBe('ELIGIBILITY');
    expect(decision.tier).toBe('llm_fallback');
  });

  it('폴백이 null(실패/타임아웃)이면 기존 SEARCH 기본값을 유지한다', async () => {
    const { classifier } = stubClassifier(null);
    const service = new QueryAnalysisService(classifier);

    const decision = await service.resolveRouteSmart('복지 혜택 더 받으려면 어떻게 해야 해?');

    expect(decision.routeType).toBe('SEARCH');
    expect(decision.tier).toBe('regex_default');
  });

  it('폴백이 reject해도 기존 기본값으로 진행한다', async () => {
    const classify = jest.fn(() => Promise.reject(new Error('LLM down')));
    const service = new QueryAnalysisService({ classify });

    const decision = await service.resolveRouteSmart('복지 혜택 더 받으려면 어떻게 해야 해?');

    expect(decision.routeType).toBe('SEARCH');
    expect(decision.tier).toBe('regex_default');
  });

  it('폴백 미설정이면 항상 정규식 단독으로 동작한다', async () => {
    const service = new QueryAnalysisService();

    const decision = await service.resolveRouteSmart('복지 혜택 더 받으려면 어떻게 해야 해?');

    expect(decision.routeType).toBe('SEARCH');
    expect(decision.tier).toBe('regex');
  });
});
