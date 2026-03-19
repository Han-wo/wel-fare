import type { UserProfile } from '@welfare-ai/shared-types';
import type { RagRouteType } from './rag-router.service';

type MissingField = 'policy_name' | 'region' | 'age' | 'income' | 'housing';

export type RagClarificationRequest = {
  missingFields: MissingField[];
  prompt: string;
  detail: string;
  reason: string;
};

const YOUTH = /청년|청년도약|청년월세|온통청년|청년수당|청년희망|청년내일/i;
const HOUSING = /주거|전세|월세|청약|임대|행복주택|국민임대|공공분양|신혼희망타운|버팀목|주거급여|LH/i;
const FACILITY = /복지관|시설|센터|주간보호|활동지원 기관|정신건강/i;
const DEADLINE = /지금\s*신청|현재\s*접수|마감\s*임박|오늘\s*청약|근처|가까운|지역/i;
const PERSONALIZED = /내\s*조건|나한테|저한테|제가|추천|맞춤|받을 수|가능한|해당되는/i;
const LOW_INCOME = /저소득|기초생활|차상위|중위소득|소득/i;
const PRONOUN_POLICY = /(이|그)\s*(정책|제도|지원|공고|서비스|거)/i;
const EXPLICIT_REGION =
  /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|제주도|[가-힣]{2,}(시|군|구))/;
const EXPLICIT_AGE = /(?:만\s*)?\d{1,2}\s*세|(?:19|20)\d{2}\s*년생/;
const EXPLICIT_INCOME = /중위소득\s*\d{1,3}%|연\s*소득|월\s*소득|기초생활수급|차상위/;
const EXPLICIT_HOUSING = /무주택|자가|전세 거주|월세 거주|임차|세입자/;
const SPECIFIC_PROGRAM =
  /청년월세|청년도약계좌|청년수당|행복주택|국민임대|공공분양|신혼희망타운|버팀목|주거급여|기초연금|기초생활|의료급여|활동지원|복지관|주간보호|청약|지원금|수당|계좌|시설|센터/i;

export function getClarificationRequest(input: {
  routeType: RagRouteType;
  question: string;
  profile: UserProfile | null;
}): RagClarificationRequest | null {
  const question = input.question.trim();
  const profile = input.profile;
  const missingFields: MissingField[] = [];

  const hasSpecificProgram = SPECIFIC_PROGRAM.test(question) || !PRONOUN_POLICY.test(question);
  const hasRegion = Boolean(profile?.sidoCode || profile?.sigunguCode || profile?.dongName) || EXPLICIT_REGION.test(question);
  const hasAge = Boolean(profile?.birthDate) || EXPLICIT_AGE.test(question);
  const hasIncome = Boolean(profile?.incomeBracket || profile?.annualIncome) || EXPLICIT_INCOME.test(question);
  const hasHousing = Boolean(profile) || EXPLICIT_HOUSING.test(question);

  const needsRegion = DEADLINE.test(question) || FACILITY.test(question);
  const needsAge = YOUTH.test(question);
  const needsIncome = LOW_INCOME.test(question) || (input.routeType === 'ELIGIBILITY' && (YOUTH.test(question) || HOUSING.test(question) || PERSONALIZED.test(question)));
  const needsHousing = input.routeType === 'ELIGIBILITY' && HOUSING.test(question);

  if ((input.routeType === 'ELIGIBILITY' || input.routeType === 'APPLICATION_ASSIST') && PRONOUN_POLICY.test(question) && !hasSpecificProgram) {
    missingFields.push('policy_name');
  }

  if (input.routeType === 'SEARCH' && PERSONALIZED.test(question)) {
    if (needsAge && !hasAge) missingFields.push('age');
    if ((needsRegion || HOUSING.test(question)) && !hasRegion) missingFields.push('region');
    if ((needsIncome || HOUSING.test(question)) && !hasIncome) missingFields.push('income');
    if (needsHousing && !hasHousing) missingFields.push('housing');
  }

  if (input.routeType === 'ELIGIBILITY') {
    if (needsAge && !hasAge) missingFields.push('age');
    if (needsRegion && !hasRegion) missingFields.push('region');
    if (needsIncome && !hasIncome) missingFields.push('income');
    if (needsHousing && !hasHousing) missingFields.push('housing');
  }

  if (input.routeType === 'APPLICATION_ASSIST') {
    if (needsRegion && !hasRegion) missingFields.push('region');
  }

  const uniqueMissingFields = [...new Set(missingFields)].slice(0, 3);
  if (uniqueMissingFields.length === 0) {
    return null;
  }

  return {
    missingFields: uniqueMissingFields,
    prompt: buildClarificationPrompt(uniqueMissingFields),
    detail: buildClarificationDetail(uniqueMissingFields),
    reason: '질문에 필요한 공공 데이터 필터 조건이 사용자 프로필과 현재 질문에 모두 부족해 추가 정보를 요청했습니다.',
  };
}

function buildClarificationPrompt(fields: MissingField[]) {
  const lines = fields.map((field, index) => `${index + 1}. ${fieldQuestion(field)}`);
  return [
    '정확하게 찾으려면 아래 정보가 더 필요합니다.',
    ...lines,
    '정보를 보내주시면 그 조건으로 바로 다시 찾아드릴게요.',
  ].join('\n');
}

function buildClarificationDetail(fields: MissingField[]) {
  return `추가 정보 요청: ${fields.map((field) => fieldLabel(field)).join(', ')}`;
}

function fieldLabel(field: MissingField) {
  switch (field) {
    case 'policy_name':
      return '정책/공고명';
    case 'region':
      return '거주 지역';
    case 'age':
      return '나이';
    case 'income':
      return '소득 기준';
    case 'housing':
      return '주거 상태';
  }
}

function fieldQuestion(field: MissingField) {
  switch (field) {
    case 'policy_name':
      return '어떤 정책이나 공고를 말하는지 알려주세요. 예: 청년월세 지원, 행복주택, 청년도약계좌';
    case 'region':
      return '거주 지역을 알려주세요. 예: 경기도 수원시, 서울 마포구';
    case 'age':
      return '나이 또는 출생연도를 알려주세요. 예: 만 27세, 1998년생';
    case 'income':
      return '소득 기준을 알려주세요. 예: 중위소득 80% 이하, 연소득 3,600만원';
    case 'housing':
      return '주거 상태를 알려주세요. 예: 무주택, 전세 거주, 월세 거주';
  }
}
