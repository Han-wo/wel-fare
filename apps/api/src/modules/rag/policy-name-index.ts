/**
 * 질문이 지목한 정책명을 코퍼스 전체에서 찾아주는 인덱스의 계약.
 *
 * 배경: 신뢰도 게이트(assess_retrieval)는 "질문이 지목한 정책이 검색 결과에
 * 없으면 저신뢰"로 판정한다. 그런데 지목 여부를 하드코딩 30개 목록으로만
 * 판별하면 나머지 정책(8천여 건)은 게이트가 항상 통과 처리돼, 그 뒤에 붙은
 * retry_search·HITL 복구 경로가 사실상 동작하지 않는다.
 *
 * 구현은 policy-name-index.service. 미주입(단위 테스트 등)이면
 * QueryAnalysisService가 하드코딩 목록만으로 동작한다.
 */
export const POLICY_NAME_INDEX = 'POLICY_NAME_INDEX';

export interface PolicyNameIndex {
  /** 질문에 통째로 등장하는 정책명을 긴 것부터 돌려준다. 없으면 빈 배열. */
  match(question: string): string[];
}
