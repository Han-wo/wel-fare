import type { UserProfile } from '@welfare-ai/shared-types';

/**
 * HITL 보충 답변 → 지속 프로필 사실 변환의 순수 로직.
 *
 * 사용자가 클래리피케이션에서 알려준 나이대/지역/소득/주거는 이번 턴에서만
 * 쓰고 버리면 다음 세션에서 똑같이 재질문하게 된다. 여기서 파싱한 사실은
 * user_profile_facts에 저장되고, getProfile이 hitlFacts로 얹어 라우팅·컨텍스트
 * 양쪽에서 소비한다.
 *
 * policy_name/category는 질문 단위 문맥이라 지속 사실로 저장하지 않는다.
 */
export type HitlFactField = 'region' | 'age' | 'income' | 'housing';

export type HitlFacts = Partial<Record<HitlFactField, string>>;

// getProfile이 반환하는 프로필에 대화 유래 사실을 얹은 형태.
export type ProfileWithFacts = UserProfile & { hitlFacts?: Record<string, string> };

// hitl-panel labelForField와 대응하는 라벨. 프론트 문구가 바뀌면 여기도 바꾼다.
const LABEL_TO_FIELD: Record<string, HitlFactField> = {
  지역: 'region',
  나이대: 'age',
  나이: 'age',
  소득: 'income',
  주거: 'housing',
  '주거 형태': 'housing',
  '주거 상태': 'housing',
};

const AGE_RE = /(만\s*)?\d{1,3}\s*세|\d{1,2}\s*대|(19|20)\d{2}\s*년생/;
const REGION_RE =
  /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣]*(\s*[가-힣]{1,6}(시|군|구))?/;
const INCOME_RE = /중위소득\s*\d{1,3}\s*%(\s*이하)?|기초생활수급(자)?|차상위(계층)?|저소득/;
const HOUSING_RE = /무주택|자가|전세(\s*거주)?|월세(\s*거주)?|임차|세입자/;

// "지역: 서울, 나이대: 30대" 형태(패널 합성 답변)의 라벨 세그먼트를 파싱하고,
// 라벨이 없는 자유 입력("만 27세고 서울 살아요")은 패턴 추출로 보완한다.
export function parseSupplementFacts(supplement: string): HitlFacts {
  const facts: HitlFacts = {};
  const text = supplement.trim();
  if (!text) return facts;

  // 라벨형 입력("라벨: 값")이 하나라도 있으면 자유 텍스트 추출은 하지 않는다.
  // "정책명: 청년월세" 같은 미지원 라벨의 값에서 "월세"가 주거로 오인되는 것을 막는다.
  let sawLabelShape = false;
  for (const segment of text.split(',')) {
    const match = segment.match(/^\s*([^:]{1,8}):\s*(.+)$/);
    if (!match) continue;
    sawLabelShape = true;
    const field = LABEL_TO_FIELD[match[1].trim()];
    if (!field) continue;
    facts[field] = match[2].trim();
  }

  if (!sawLabelShape) {
    const age = text.match(AGE_RE);
    const region = text.match(REGION_RE);
    const income = text.match(INCOME_RE);
    const housing = text.match(HOUSING_RE);
    if (age) facts.age = age[0].trim();
    if (region) facts.region = region[0].trim();
    if (income) facts.income = income[0].trim();
    if (housing) facts.housing = housing[0].trim();
  }

  return facts;
}

export function getHitlFacts(profile: UserProfile | null): Record<string, string> {
  return (profile as ProfileWithFacts | null)?.hitlFacts ?? {};
}

// LLM 컨텍스트 메시지에 넣는 한 줄 요약. 사실이 없으면 null.
export function formatHitlFactsLine(profile: UserProfile | null): string | null {
  const facts = getHitlFacts(profile);
  const entries = Object.entries(facts);
  if (entries.length === 0) return null;

  const labels: Record<string, string> = {
    region: '지역',
    age: '나이대',
    income: '소득',
    housing: '주거',
  };
  const parts = entries.map(([field, value]) => `${labels[field] ?? field} ${value}`);
  return `- 이전 대화에서 확인한 정보: ${parts.join(' · ')}`;
}
