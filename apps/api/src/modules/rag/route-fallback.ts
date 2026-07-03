import type { RagRouteType } from './query-analysis.service';

/**
 * 라우팅 2단 구조의 폴백 계약.
 *
 * 1단(정규식)이 확신하는 케이스는 그대로 통과하고, "의도 표현은 있는데 어떤
 * 워크플로우인지 정규식이 못 가른" 케이스만 이 분류기에 위임한다. 분류기가
 * 없거나(미설정), 실패하거나, 시간 초과면 기존 동작(SEARCH 기본값)으로
 * 떨어지므로 폴백 도입이 기존 라우팅을 절대 후퇴시키지 않는다.
 *
 * eval 하네스(routing-harness)는 1단 정규식만 검증한다 — resolveRoute는
 * 동기·결정적으로 유지된다.
 */
export interface RouteFallbackResult {
  routeType: RagRouteType;
  reason: string;
}

export interface RouteFallbackClassifier {
  classify(question: string): Promise<RouteFallbackResult | null>;
}

export const ROUTE_FALLBACK_CLASSIFIER = Symbol('ROUTE_FALLBACK_CLASSIFIER');

export type RouteTier = 'regex' | 'llm_fallback' | 'regex_default' | 'hitl_resume';
