import type { RagRouteType } from '../query-analysis.service';

/**
 * 라우팅 골든 데이터셋.
 *
 * QueryAnalysisService의 정규식 라우팅(resolveRoute + resolveSearchPreRoute)이
 * 의도한 동작에서 회귀하지 않도록 잠그는 안전망이자, false positive/negative를
 * 드러내는 eval 입력이다.
 *
 * - expectedRoute: resolveRoute가 내려야 하는 워크플로우.
 * - expectedPreRouteTool: (SEARCH 라우트일 때) resolveSearchPreRoute가 골라야 하는
 *   도구. null이면 "사전 라우팅 없이 LLM 에이전트가 판단" 이 기대값.
 *   undefined(미지정)이면 사전 라우팅을 검증하지 않는다(SEARCH 외 라우트 등).
 * - knownGap: 현재 정규식이 기대값과 다르게 동작하지만, 이미 인지하고 있는
 *   한계. 하네스가 "REGRESSION"이 아니라 "KNOWN GAP"으로 분류해 빌드를 깨지
 *   않게 한다. reason에 갭의 성격을 적는다.
 */
export type PreRouteToolName =
  | 'get_upcoming_deadlines'
  | 'search_youth_policy'
  | 'search_housing_subscription'
  | 'search_rental_support'
  | 'search_welfare_facility';

export interface RoutingGoldenCase {
  id: string;
  question: string;
  expectedRoute: RagRouteType;
  expectedPreRouteTool?: PreRouteToolName | null;
  tags?: string[];
  knownGap?: { reason: string };
}

export const ROUTING_GOLDEN: RoutingGoldenCase[] = [
  // --- SEARCH: 마감/접수 임박 ---
  {
    id: 'deadline-now',
    question: '지금 신청 가능한 청약 공고 보여줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'get_upcoming_deadlines',
    tags: ['deadline'],
  },
  {
    id: 'deadline-today',
    question: '오늘 청약 뭐 있어?',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'get_upcoming_deadlines',
    tags: ['deadline'],
  },
  {
    id: 'deadline-imminent',
    question: '마감 임박한 공고 알려줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'get_upcoming_deadlines',
    tags: ['deadline'],
  },

  // --- SEARCH: 향후 N일 청약 타임라인 ---
  {
    id: 'housing-timeline-30',
    question: '향후 30일 청약 공고 정리해줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'get_upcoming_deadlines',
    tags: ['deadline', 'housing'],
  },
  {
    id: 'housing-timeline-7',
    question: '향후 7일 분양 일정 보여줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'get_upcoming_deadlines',
    tags: ['deadline', 'housing'],
  },

  // --- SEARCH: 청년 전용 ---
  {
    id: 'youth-allowance',
    question: '청년수당 어떤 게 있어?',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'search_youth_policy',
    tags: ['youth'],
  },
  {
    id: 'youth-account',
    question: '청년도약계좌 알려줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'search_youth_policy',
    tags: ['youth'],
  },
  {
    id: 'youth-generic',
    question: '청년 정책 뭐 있나요',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'search_youth_policy',
    tags: ['youth'],
  },

  // --- SEARCH: 청약/분양 공고 ---
  {
    id: 'housing-sub-schedule',
    question: '행복주택 청약 일정 알려줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'search_housing_subscription',
    tags: ['housing'],
  },
  {
    id: 'housing-sub-notice',
    question: '분양 공고 보여줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'search_housing_subscription',
    tags: ['housing'],
  },

  // --- SEARCH: 전월세/임대 지원 ---
  {
    id: 'rental-jeonse',
    question: '버팀목 전세자금 대출 알려줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'search_rental_support',
    tags: ['rental'],
  },

  // --- SEARCH: 복지 시설 ---
  {
    id: 'facility-near',
    question: '가까운 복지관 어디 있어?',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'search_welfare_facility',
    tags: ['facility'],
  },
  {
    id: 'facility-daycare',
    question: '주간보호 센터 찾아줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: 'search_welfare_facility',
    tags: ['facility'],
  },

  // --- SEARCH: 사전 라우팅 없이 에이전트 위임 (preRoute null) ---
  {
    id: 'plain-basic-livelihood',
    question: '기초생활수급 지원 내용 설명해줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: null,
    tags: ['general'],
  },
  {
    id: 'plain-medical',
    question: '의료급여가 뭐야?',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: null,
    tags: ['general'],
  },
  {
    id: 'plain-disability',
    question: '장애인 지원 제도 알려줘',
    expectedRoute: 'SEARCH',
    expectedPreRouteTool: null,
    tags: ['general'],
  },

  // --- ELIGIBILITY: 자격/대상 판별 ---
  {
    id: 'elig-can-i-get',
    question: '내가 청년월세 받을 수 있어?',
    expectedRoute: 'ELIGIBILITY',
    tags: ['eligibility'],
  },
  {
    id: 'elig-qualification',
    question: '기초연금 자격이 어떻게 돼?',
    expectedRoute: 'ELIGIBILITY',
    tags: ['eligibility'],
  },
  {
    id: 'elig-target',
    question: '나 이 정책 대상인지 확인해줘',
    expectedRoute: 'ELIGIBILITY',
    tags: ['eligibility'],
  },
  {
    id: 'elig-condition',
    question: '행복주택 조건이 뭐야?',
    expectedRoute: 'ELIGIBILITY',
    tags: ['eligibility'],
  },

  // --- APPLICATION_ASSIST: 신청 절차/서류 ---
  {
    id: 'app-how-method',
    question: '청년수당 신청 방법 알려줘',
    expectedRoute: 'APPLICATION_ASSIST',
    tags: ['application'],
  },
  {
    id: 'app-how-to-apply',
    question: '어떻게 신청해야 하나요?',
    expectedRoute: 'APPLICATION_ASSIST',
    tags: ['application'],
  },
  {
    id: 'app-documents',
    question: '필요 서류가 뭐야?',
    expectedRoute: 'APPLICATION_ASSIST',
    tags: ['application'],
  },
  {
    id: 'app-next-step',
    question: '다음 단계 뭐 해야 해?',
    expectedRoute: 'APPLICATION_ASSIST',
    tags: ['application'],
  },

  // --- 경계/충돌 케이스 (하네스가 갭을 드러내는 핵심 입력) ---
  {
    id: 'conflict-youth-and-housing',
    question: '청년수당이랑 청약 일정 같이 알려줘',
    expectedRoute: 'SEARCH',
    // 의도: 둘 중 하나(또는 에이전트 위임). 현재 정규식은 youth/housing 상호배제
    // 조건 때문에 둘 다 건너뛰고 null을 반환 → 사전 라우팅이 사라지는 갭.
    expectedPreRouteTool: 'search_youth_policy',
    tags: ['conflict', 'youth', 'housing'],
    knownGap: {
      reason:
        'CLEAR_YOUTH && !CLEAR_HOUSING_SUB / CLEAR_HOUSING_SUB && !CLEAR_YOUTH 의 상호배제로 두 키워드 동시 등장 시 사전 라우팅이 null로 빠진다.',
    },
  },
  {
    id: 'app-with-youth-keyword',
    question: '주거급여 신청하려면 뭐부터 해야 해?',
    expectedRoute: 'APPLICATION_ASSIST',
    tags: ['application', 'rental'],
  },
];
