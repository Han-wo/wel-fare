/**
 * 데이터 시각화용 범주형 색상 — 단일 출처.
 *
 * 면·글자·액센트는 globals.css의 CSS 변수가 담당한다. 여기 있는 색은
 * 차트·그래프처럼 "서로 구별되어야 하는" 자리에만 쓴다. 브랜드 팔레트는
 * 한색 위주라 구별 가능한 색상(hue)을 많이 만들 수 없으므로, 개수를 늘리는
 * 대신 아이콘·레이블과 함께 쓰는 것을 전제로 한다.
 *
 * 아래 6색은 검증을 통과한 조합이다:
 *   명도 밴드 PASS · 채도 하한 PASS · 색각이상 분리 PASS ·
 *   정상시야 분리 PASS · 배경 대비 PASS
 *
 * ⚠️ 한 색이라도 바꾸려면 다시 검증해야 한다. 눈으로 판단하면 안 된다.
 * 색을 추가하는 것도 금지다 — 7번째가 필요하면 범주를 묶거나
 * 아이콘·레이블 같은 2차 인코딩으로 구별해야 한다.
 */
export const CATEGORICAL = {
  // 브랜드(blue-900 #0d47a1)와 같은 한색 계열이라 함께 놓아도 어울린다.
  // 브랜드 색으로 교체하고 싶다면 반드시 검증기를 다시 돌려야 한다 —
  // 6개 검사(명도·채도·색각이상·정상시야·대비)를 통과한 조합이다.
  indigo: '#5159a8',
  teal: '#0d9488',
  amber: '#c07a1e',
  plum: '#be3f6e',
  blue: '#2e79c9',
  green: '#5e9433',
} as const;

export type CategoricalColor = (typeof CATEGORICAL)[keyof typeof CATEGORICAL];

/** RAG 파이프라인 단계별 색. 노드/이벤트 양쪽에서 같은 단계는 같은 색이어야 한다. */
export const PHASE_COLOR = {
  question: CATEGORICAL.indigo,
  route: CATEGORICAL.blue,
  profile: CATEGORICAL.plum,
  tool: CATEGORICAL.amber,
  retrieval: CATEGORICAL.teal,
  graph: CATEGORICAL.green,
} as const;
