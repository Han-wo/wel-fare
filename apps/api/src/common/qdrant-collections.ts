/**
 * Qdrant 컬렉션 구분.
 *
 * 정책과 시설을 한 컬렉션에 두면 안 되는 이유:
 *  - 성격이 다르다. 정책은 "무엇을 받을 수 있나", 시설은 주소록이다.
 *    복지관 한 곳이 정책 하나와 같은 무게로 벡터 공간을 차지한다.
 *  - 비율이 1:3이다(정책 9,183 / 시설 30,694). source 필터가 빠진 경로가
 *    하나라도 생기면 즉시 오염된다 — 실제로 추천 질문이 임대단지 목록에
 *    잠식된 적이 있다.
 *  - 정책 검색이 4배 큰 공간을 뒤진다.
 */
export const POLICY_COLLECTION =
  process.env.QDRANT_COLLECTION ?? 'welfare_policies';

export const FACILITY_COLLECTION =
  process.env.QDRANT_FACILITY_COLLECTION ?? 'welfare_facilities';
