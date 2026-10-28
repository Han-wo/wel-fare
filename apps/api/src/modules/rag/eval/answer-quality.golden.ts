/**
 * 답변 품질 골든셋.
 *
 * 기존 세 하네스(라우팅 / retrieval-HITL / 그라운딩)는 전부 순수 함수를
 * 검증한다. 이건 다르다 — 실제 파이프라인(라우팅 → 검색 → LLM → HITL)을
 * 끝까지 태우고 결과를 본다. 그래서 DB·Qdrant·OpenAI가 살아 있어야 하고,
 * CI의 유닛 테스트가 아니라 별도 러너로 돈다.
 *
 * ── 기대값을 "정답 문장"으로 두지 않는 이유
 * LLM 출력은 매번 다르다. 정답 문장을 박으면 멀쩡한 답변에도 실패가 나고,
 * 몇 번 겪으면 아무도 안 돌리게 된다. 그래서 **검증 가능한 조건**만 쓴다:
 * 어떤 도구를 불렀는가, HITL이 떴는가, 특정 정책명이 답변에 있는가,
 * 없는 걸 지어내지 않았는가.
 *
 * ── 케이스를 고른 기준
 * 전부 이 프로젝트에서 실제로 터졌던 회귀다. 골든셋이 있었다면 더 일찍
 * 잡혔을 것들이라, 같은 함정에 다시 빠지지 않게 고정한다.
 */

export interface AnswerQualityCase {
  id: string;
  question: string;
  /** 왜 이 케이스가 있는지 — 과거에 뭐가 터졌는지 적는다. */
  rationale: string;

  /** 이 도구들이 호출돼야 한다(부분집합 검사). */
  expectTools?: string[];
  /** HITL 설문이 떠야 하는가. 미지정이면 검증하지 않는다. */
  expectHitl?: boolean;
  /** HITL이 떴다면 이 필드를 물어야 한다. */
  expectHitlField?: string;
  /** 답변에 반드시 등장해야 하는 문자열(정책명 등). */
  expectIncludes?: string[];
  /** 답변에 등장하면 안 되는 문자열(내부 필드명·환각 지표 등). */
  expectExcludes?: string[];
  /** 답변이 "못 찾음"으로 끝나야 하는가. 환각 방지 케이스. */
  expectNotFound?: boolean;
  /** 자격판정 태그. 하나라도 맞으면 통과. */
  expectVerdictOneOf?: string[];
  /** 답변 최소 길이. 빈 답·한 줄 답을 거른다. */
  minAnswerLength?: number;

  /** 현재 통과하지 못하지만 인지하고 있는 한계. 빌드를 깨지 않는다. */
  knownGap?: string;
}

export const ANSWER_QUALITY_GOLDEN: AnswerQualityCase[] = [
  // ── 검색·인용 기본기 ──────────────────────────────────────────
  {
    id: 'static-doc-named',
    question: '문화비 소득공제 알려줘',
    rationale:
      '세법 조항형 제도는 어떤 공공 API에도 없어 static_doc으로만 들어온다. ' +
      '렉시컬 arm이 bokjiro/local_bokjiro만 보던 시절엔 이름으로 못 찾았다.',
    expectIncludes: ['문화비 소득공제'],
    expectHitl: false,
    minAnswerLength: 200,
  },
  {
    id: 'culture-welfare-discovery',
    question: '문화생활 지원해주는 복지 뭐 있어?',
    rationale:
      '"주택·청년만 나온다"는 제보의 출발점. 문화 복지가 코퍼스에 있는데 ' +
      '안 나오는지 확인한다(실제 원인은 추천 질문이었다).',
    expectTools: ['search_welfare'],
    expectIncludes: ['통합문화이용권'],
    minAnswerLength: 200,
  },
  {
    id: 'no-internal-field-names',
    question: '무주택 1인가구가 받을 수 있는 주거 지원 알려줘',
    rationale:
      '프롬프트가 도구 스키마를 필드명으로 설명해, 모델이 이를 인용 표기로 ' +
      '오해하고 "(출처: items[].content)"를 26회 내보낸 적이 있다.',
    expectExcludes: ['items[]', 'metadata', '(출처: items'],
    minAnswerLength: 200,
  },

  // ── HITL ────────────────────────────────────────────────────
  {
    id: 'pronoun-without-program',
    question: '그 정책 자세히 알려줘',
    rationale:
      '지시어만 있고 정책명이 없으면 되물어야 한다. 선택지 없이 추측해 ' +
      '답하면 엉뚱한 정책을 안내하게 된다.',
    expectHitl: true,
    expectHitlField: 'policy_name',
  },
  {
    id: 'no-option-menu-ending',
    question: '서울 사는 무주택자인데 주거 지원 뭐가 있는지 다 알려줘',
    rationale:
      '답변이 "(A)/(B)/(C) 중 하나를 알려주시면"으로 끝나면 그건 답변이 ' +
      '아니라 재질문이다. HITL 탐지가 링크 있는 긴 답변을 놓쳤던 케이스.',
    expectExcludes: ['(A)', '(B)', '(C)'],
    minAnswerLength: 300,
  },

  // ── 연령 결정적 판정 ─────────────────────────────────────────
  {
    id: 'age-mismatch-reason',
    question: '햇살론유스 청년 지원금 알려줘',
    rationale:
      '청년정책 2,785건의 구조화 연령 조건을 RAG가 한 번도 읽지 않았다. ' +
      '만 36세 프로필이면 미해당 사유가 나와야 한다(LLM 추측이 아니라 판정).',
    expectIncludes: ['19', '34'],
    minAnswerLength: 200,
  },
  {
    id: 'age-eligibility-verdict',
    question: '만 36세인데 청년월세 지원 받을 수 있어?',
    rationale: '자격 판정 라우트. 낙관하지 않고 조건 불일치를 명시해야 한다.',
    expectVerdictOneOf: ['[어려움]', '[불확실]'],
    minAnswerLength: 150,
  },

  // ── 환각 방지 ───────────────────────────────────────────────
  {
    id: 'out-of-corpus-pet',
    question: '반려동물 의료비 지원 받을 수 있어?',
    rationale:
      '코퍼스에 없는 주제. 없는 정책을 지어내지 말고 못 찾았다고 해야 한다.',
    expectNotFound: true,
  },
  {
    id: 'out-of-corpus-crypto',
    question: '암호화폐 투자 손실 지원금 받을 수 있어?',
    rationale:
      '코퍼스에 0건인 주제(암호화폐·가상자산). 주제만 겹치는 서민금융 정책을 ' +
      '끌어다 답하면 안 된다. ' +
      '※ 처음엔 "유학 자금"으로 뒀다가 뺐다 — 실제로 "우수고등학교 해외유학 ' +
      '장학금" 등이 코퍼스에 있어 정상 검색을 환각으로 오판했다. ' +
      '환각 케이스는 코퍼스에 정말 없는 주제로만 만들어야 한다.',
    expectNotFound: true,
  },

  // ── 도구 선택 ───────────────────────────────────────────────
  {
    id: 'youth-tool-routing',
    question: '청년 정책 뭐 있어?',
    rationale: 'pre-route 정규식이 search_youth_policy로 직행해야 한다.',
    expectTools: ['search_youth_policy'],
    minAnswerLength: 200,
  },
  {
    id: 'facility-tool-routing',
    question: '근처 노인 주간보호센터 찾아줘',
    rationale:
      '시설은 전용 컬렉션으로 분리됐다. 분리 후에도 검색이 되는지 잠근다.',
    expectTools: ['search_welfare_facility'],
    minAnswerLength: 150,
  },
  {
    id: 'housing-subscription-routing',
    question: '행복주택 청약 일정 알려줘',
    rationale: '청약 공고는 별도 소스·도구다. 일반 복지 검색으로 새면 안 된다.',
    expectTools: ['search_housing_subscription'],
  },

  // ── 조항 단위 질문 (청킹 효과) ────────────────────────────────
  {
    id: 'clause-level-criteria',
    question: '공공분양 선정 기준이 어떻게 돼?',
    rationale:
      '긴 문서를 벡터 하나로 뭉개면 조항 질문이 희석된다. 섹션 청킹 이후 ' +
      '[선정기준] 조각이 직접 매칭돼야 한다.',
    expectIncludes: ['공공분양'],
    minAnswerLength: 150,
  },
];
