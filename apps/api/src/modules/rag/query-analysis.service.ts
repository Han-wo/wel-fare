import { Injectable } from '@nestjs/common';
import type { UserProfile } from '@welfare-ai/shared-types';

export type RagRouteType = 'SEARCH' | 'ELIGIBILITY' | 'APPLICATION_ASSIST';

export type RagRouteDecision = {
  routeType: RagRouteType;
  detail: string;
};

type MissingField = 'policy_name' | 'region' | 'age' | 'income' | 'housing';

export type RagClarificationRequest = {
  missingFields: MissingField[];
  prompt: string;
  detail: string;
  reason: string;
};

export type PreRouteDecision = {
  toolName:
    | 'get_upcoming_deadlines'
    | 'search_youth_policy'
    | 'search_housing_subscription'
    | 'search_rental_support'
    | 'search_welfare_facility';
  args: Record<string, unknown>;
  detail: string;
};

export type ApplicationSource =
  | 'deadline'
  | 'youth'
  | 'housing_subscription'
  | 'rental_support'
  | 'welfare_facility'
  | 'welfare'
  | 'policy_lookup';

const ELIGIBILITY_INTENT =
  /받을 수 있|받을수있|자격(이|은|을)?|조건(이|은|을)?\s*(뭐|무엇|어떻|되는|맞|해당)|대상인지|해당되|가능한지|eligible/i;
const APPLICATION_ASSIST_INTENT =
  /신청\s*(방법|절차|순서|링크|페이지)|어떻게\s*신청|신청하려면|준비\s*서류|필요\s*서류|준비물|제출\s*서류|다음\s*단계|뭐부터\s*해야/i;

const CLEAR_YOUTH =
  /청년수당|청년적금|청년도약계좌|청년희망적금|온통청년|청년내일채움|청년취업지원금|청년창업지원금|청년 정책 뭐|청년 지원금/;
const CLEAR_DEADLINE = /지금\s*신청\s*가능|현재\s*접수\s*중|마감\s*임박|신청\s*가능한\s*청약|오늘\s*청약/;
const CLEAR_HOUSING_SUB = /청약홈\s*공고|분양\s*공고|행복주택\s*청약|국민임대\s*청약|청약\s*일정|청약\s*접수\s*기간/;
const CLEAR_HOUSING_TIMELINE = /향후\s*(\d{1,2})\s*일|향후\s*공고|예정\s*공고|전체\s*청약정보/;
const CLEAR_RENTAL = /주거급여\s*신청|버팀목\s*전세|전세자금\s*대출|월세\s*보조금|LH\s*임대단지|공공임대\s*입주/;
const CLEAR_FACILITY = /복지관\s*어디|시설\s*찾아|주간보호\s*센터|활동지원\s*기관|가까운\s*복지/;

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

@Injectable()
export class QueryAnalysisService {
  private extractDaysAhead(question: string) {
    const match = question.match(/향후\s*(\d{1,2})\s*일|(\d{1,2})\s*일\s*기준|최대\s*(\d{1,2})\s*일/);
    const raw = match?.slice(1).find(Boolean);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 30) {
      return parsed;
    }
    return 30;
  }

  resolveRoute(question: string): RagRouteDecision {
    if (ELIGIBILITY_INTENT.test(question)) {
      return {
        routeType: 'ELIGIBILITY',
        detail: '질문에 자격·조건·대상 판별 의도가 있어 자격확인 workflow로 라우팅했습니다.',
      };
    }

    if (APPLICATION_ASSIST_INTENT.test(question)) {
      return {
        routeType: 'APPLICATION_ASSIST',
        detail: '질문에 신청 절차·서류·실행 단계 의도가 있어 신청도움 workflow로 라우팅했습니다.',
      };
    }

    return {
      routeType: 'SEARCH',
      detail: '기본 검색형 질문으로 판단해 검색 ReAct 그래프로 라우팅했습니다.',
    };
  }

  resolveSearchPreRoute(input: {
    question: string;
    userId: string;
    traceId: string;
  }): PreRouteDecision | null {
    const q = input.question;

    if (CLEAR_DEADLINE.test(q)) {
      return {
        toolName: 'get_upcoming_deadlines',
        args: { userId: input.userId, days_ahead: 14, traceId: input.traceId },
        detail: '정규식 규칙이 질문을 get_upcoming_deadlines로 바로 라우팅했습니다.',
      };
    }
    if (CLEAR_HOUSING_TIMELINE.test(q) && /청약|공고|분양|행복주택|국민임대|신혼희망타운/i.test(q)) {
      const daysAhead = this.extractDaysAhead(q);
      return {
        toolName: 'get_upcoming_deadlines',
        args: { userId: input.userId, days_ahead: daysAhead, traceId: input.traceId },
        detail: '정규식 규칙이 향후 청약 일정 질문을 get_upcoming_deadlines로 라우팅했습니다.',
      };
    }
    if (CLEAR_YOUTH.test(q) && !CLEAR_HOUSING_SUB.test(q)) {
      return {
        toolName: 'search_youth_policy',
        args: { question: q, traceId: input.traceId },
        detail: '정규식 규칙이 질문을 search_youth_policy로 바로 라우팅했습니다.',
      };
    }
    if (CLEAR_HOUSING_SUB.test(q) && !CLEAR_YOUTH.test(q)) {
      return {
        toolName: 'search_housing_subscription',
        args: { question: q, userId: input.userId, traceId: input.traceId },
        detail: '정규식 규칙이 질문을 search_housing_subscription로 바로 라우팅했습니다.',
      };
    }
    if (CLEAR_RENTAL.test(q)) {
      return {
        toolName: 'search_rental_support',
        args: { question: q, userId: input.userId, traceId: input.traceId },
        detail: '정규식 규칙이 질문을 search_rental_support로 바로 라우팅했습니다.',
      };
    }
    if (CLEAR_FACILITY.test(q)) {
      return {
        toolName: 'search_welfare_facility',
        args: { question: q, facility_type: '', userId: input.userId, traceId: input.traceId },
        detail: '정규식 규칙이 질문을 search_welfare_facility로 바로 라우팅했습니다.',
      };
    }

    return null;
  }

  selectApplicationSources(input: {
    question: string;
    hasProfile: boolean;
  }): ApplicationSource[] {
    const sources: ApplicationSource[] = [];
    const question = input.question;

    if (DEADLINE.test(question)) sources.push('deadline');
    if (YOUTH.test(question)) sources.push('youth');
    if (CLEAR_HOUSING_SUB.test(question) || /청약|분양|행복주택|국민임대|공공분양|신혼희망타운/i.test(question)) {
      sources.push('housing_subscription');
    }
    if (CLEAR_RENTAL.test(question) || HOUSING.test(question)) {
      sources.push('rental_support');
    }
    if (FACILITY.test(question)) sources.push('welfare_facility');

    if (sources.length > 0) {
      return [...new Set(sources)];
    }

    return [input.hasProfile ? 'welfare' : 'policy_lookup'];
  }

  getClarificationRequest(input: {
    routeType: RagRouteType;
    question: string;
    profile: UserProfile | null;
  }): RagClarificationRequest | null {
    const question = input.question.trim();
    const profile = input.profile;
    const missingFields: MissingField[] = [];

    const hasSpecificProgram = SPECIFIC_PROGRAM.test(question) || !PRONOUN_POLICY.test(question);
    const hasRegion =
      Boolean(profile?.sidoCode || profile?.sigunguCode || profile?.dongName) ||
      EXPLICIT_REGION.test(question);
    const hasAge = Boolean(profile?.birthDate) || EXPLICIT_AGE.test(question);
    const hasIncome = Boolean(profile?.incomeBracket || profile?.annualIncome) || EXPLICIT_INCOME.test(question);
    const hasHousing =
      Boolean(profile?.isHomeowner !== undefined || profile?.householdType) || EXPLICIT_HOUSING.test(question);

    const needsRegion = DEADLINE.test(question) || FACILITY.test(question);
    const needsAge = YOUTH.test(question);
    const needsIncome =
      LOW_INCOME.test(question) ||
      (input.routeType === 'ELIGIBILITY' &&
        (YOUTH.test(question) || HOUSING.test(question) || PERSONALIZED.test(question)));
    const needsHousing = input.routeType === 'ELIGIBILITY' && HOUSING.test(question);

    if (PRONOUN_POLICY.test(question) && !hasSpecificProgram) {
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
      detail: `추가 정보 요청: ${uniqueMissingFields.map((field) => fieldLabel(field)).join(', ')}`,
      reason:
        '질문에 필요한 공공 데이터 필터 조건이 사용자 프로필과 현재 질문에 모두 부족해 추가 정보를 요청했습니다.',
    };
  }
}

function buildClarificationPrompt(fields: MissingField[]) {
  const lines = fields.map((field, index) => `${index + 1}. ${fieldQuestion(field)}`);
  return ['정확하게 찾으려면 아래 정보가 더 필요합니다.', ...lines, '정보를 보내주시면 그 조건으로 바로 다시 찾아드릴게요.'].join('\n');
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
