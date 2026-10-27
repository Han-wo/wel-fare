import type { GroundingDoc } from '../answer-grounding';

/**
 * 답변 그라운딩 골든 데이터셋.
 *
 * checkAnswerGrounding이 충실한 답변은 통과시키고, 가짜 링크/정책명/금액은
 * ungrounded로 잡는지 회귀를 잠근다.
 */
export interface AnswerGroundingCase {
  id: string;
  answer: string;
  docs: GroundingDoc[];
  expectGrounded: boolean;
  expectUngrounded?: {
    links?: string[];
    policyNames?: string[];
    amounts?: string[];
  };
  note?: string;
}

const 기초연금_DOC: GroundingDoc = {
  title: '기초연금',
  content:
    '[정책명] 기초연금 [개요] 노인에게 기초연금을 월 최대 334,810원 지급 [신청링크] https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00001164',
};

export const ANSWER_GROUNDING_GOLDEN: AnswerGroundingCase[] = [
  {
    id: 'fully-grounded',
    answer:
      '### 📋 [기초연금]\n- 지원내용: 월 최대 334,810원\n- 신청링크: [바로 신청하기](https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00001164)',
    docs: [기초연금_DOC],
    expectGrounded: true,
  },
  {
    id: 'hallucinated-link',
    answer:
      '### 📋 [기초연금]\n- 신청링크: [바로 신청하기](https://fake-welfare-scam.example.com/apply)',
    docs: [기초연금_DOC],
    expectGrounded: false,
    expectUngrounded: { links: ['https://fake-welfare-scam.example.com/apply'] },
    note: '가짜 신청링크 — 가장 위험한 환각.',
  },
  {
    id: 'hallucinated-policy-name',
    answer: '### 📋 [행복주택]\n- 지원내용: 청년 임대주택',
    docs: [기초연금_DOC],
    expectGrounded: false,
    expectUngrounded: { policyNames: ['행복주택'] },
    note: '근거에 없는 정책을 안내.',
  },
  {
    id: 'hallucinated-amount-soft-signal',
    answer: '### 📋 [기초연금]\n- 지원내용: 월 최대 999,999원\n- 신청링크: [신청](https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00001164)',
    docs: [기초연금_DOC],
    expectGrounded: true,
    expectUngrounded: { amounts: ['999,999원'] },
    note: '금액은 soft 신호 — 보고는 하되 grounded hard 판정은 링크/정책명만.',
  },
  {
    id: 'no-claims-clarification',
    answer: '요청하신 내용을 정확히 찾지 못했어요. 아래에서 조건을 골라주시면 다시 찾아드릴게요.',
    docs: [],
    expectGrounded: true,
    note: 'HITL 재질문 등 검증할 주장이 없는 답변은 그라운딩 통과.',
  },
  {
    id: 'grounded-policy-no-link',
    answer: '### 📋 [기초연금]\n- 지원내용: 노인에게 기초연금을 지급합니다.',
    docs: [기초연금_DOC],
    expectGrounded: true,
    note: '링크 없이 정책명만 — 정책명이 근거에 있으면 통과.',
  },
  // 아래 두 건은 실제 프로덕션 trace에서 가져온 사례다. 지자체 복지는 동명 정책이
  // 지역마다 있어 LLM이 괄호로 지역을 덧붙이는데, 순수 substring 비교는 이걸
  // 환각으로 오탐했다(실측 5/6건 오탐 → 6초짜리 정정 LLM 유발).
  {
    id: 'region-annotated-policy-name',
    answer:
      '### 📋 [장애인활동지원 추가지원사업(충청북도)]\n- 지원내용: 활동지원 급여를 추가로 지원합니다.',
    docs: [{ title: '장애인활동지원 추가지원사업', content: '[정책명] 장애인활동지원 추가지원사업' }],
    expectGrounded: true,
    note: '괄호 지역 주석은 근거를 벗어난 주장이 아니다 — 떼고 매치하면 통과.',
  },
  {
    id: 'composed-label-not-a-policy',
    answer:
      '### 📋 [공공임대주택(예: 영구·국민임대) - 경기도 사례(양주시 옥정단지 등)]\n- 지원내용: 임대주택 공급',
    docs: [{ title: '기존주택 매입임대', content: '[정책명] 기존주택 매입임대' }],
    expectGrounded: false,
    expectUngrounded: {
      policyNames: ['공공임대주택(예: 영구·국민임대) - 경기도 사례(양주시 옥정단지 등)'],
    },
    note: '괄호를 떼도 남는 합성 레이블은 실제 정책명이 아니다 — 계속 잡아야 한다.',
  },
];
