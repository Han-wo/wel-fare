import type { RetrievedDoc } from '../retrieval-confidence';

/**
 * 검색 신뢰도(엔티티 부재) 게이트 골든 데이터셋.
 *
 * assess_retrieval 게이트가 회귀하지 않도록 잠그는 안전망. 라이브 Qdrant 없이
 * "질문 → 검색된 문서(title/content) → 게이트 결정"을 고정한다. 추적 과정에서
 * 발견한 false negative/positive 케이스를 그대로 박제했다.
 *
 * - expectLowConfidence true  → HITL 재질문으로 전환되어야 함(엔티티 부재).
 * - expectLowConfidence false → 정상 답변 진행(엔티티 존재 또는 미지목).
 */
export interface RetrievalHitlCase {
  id: string;
  question: string;
  docs: RetrievedDoc[];
  expectLowConfidence: boolean;
  note?: string;
}

export const RETRIEVAL_HITL_GOLDEN: RetrievalHitlCase[] = [
  // 지목된 정책이 검색 결과에 전혀 없음 → HITL (핵심 버그: 기초연금 recall 미스)
  {
    id: 'absent-기초연금',
    question: '기초연금 지원 내용 알려줘',
    docs: [
      { title: '농촌출신대학생학자금융자', content: '[정책명] 농촌출신대학생학자금융자 ...' },
      { title: '전기요금 복지할인', content: '[정책명] 전기요금 복지할인 ...' },
      { title: '주거안정 월세대출', content: '[정책명] 주거안정 월세대출 ...' },
    ],
    expectLowConfidence: true,
  },
  {
    id: 'absent-의료급여',
    question: '의료급여 혜택 알려줘',
    docs: [
      { title: '노인일자리', content: '[정책명] 노인일자리 ...' },
      { title: '국민취업지원', content: '[정책명] 국민취업지원 ...' },
    ],
    expectLowConfidence: true,
  },

  // 우발적 언급은 매칭하지 않는다 (false negative 방지: query echo / 본문 우발 언급)
  {
    id: 'incidental-mention-not-counted',
    question: '기초연금 지원 내용 알려줘',
    docs: [
      // 본문에 "기초연금"이 우발적으로 등장하지만 그 정책 자체는 아님
      { title: '전기요금 복지할인', content: '[정책명] 전기요금 복지할인 [개요] 기초연금 수급자도 신청 가능 ...' },
    ],
    expectLowConfidence: true,
    note: '본문 우발 언급("기초연금 수급자도")은 엔티티 존재로 보지 않는다.',
  },

  // 정책명(title)으로 검색됨 → 정상 답변
  {
    id: 'present-청년월세-title',
    question: '청년월세 지원 알려줘',
    docs: [
      { title: '청년월세 한시 특별지원', content: '[정책명] 청년월세 한시 특별지원 ...' },
      { title: '버팀목 전세자금대출', content: '[정책명] 버팀목 전세자금대출 ...' },
    ],
    expectLowConfidence: false,
  },

  // 본문 [정책명] 마커로 검색됨 (title이 달라도) → 정상 답변
  {
    id: 'present-주거급여-marker',
    question: '주거급여 신청하고 싶어',
    docs: [{ title: '맞춤형 급여 안내', content: '[정책명] 주거급여 [개요] 임차가구 월세 지원 ...' }],
    expectLowConfidence: false,
  },

  // 특정 정책 미지목 → 게이트 스킵(개인화/일반 질의)
  {
    id: 'skip-personalized',
    question: '내 조건에 맞는 복지 지원 추천해줘',
    docs: [{ title: '주거안정 월세대출', content: '[정책명] 주거안정 월세대출 ...' }],
    expectLowConfidence: false,
  },
  {
    id: 'skip-general',
    question: '장애인 지원 제도 알려줘',
    docs: [],
    expectLowConfidence: false,
    note: '"장애인"은 NAMED_PROGRAMS 미등록(generic) → 게이트 스킵.',
  },

  // 다중 지목: 하나라도 있으면 진행, 전부 부재면 HITL
  {
    id: 'multi-partial-match',
    question: '청년수당이랑 의료급여 둘 다 궁금해',
    docs: [{ title: '청년수당', content: '[정책명] 청년수당 ...' }],
    expectLowConfidence: false,
    note: '청년수당은 있고 의료급여는 없음 → 부분 매치 허용, 답변 진행.',
  },
  {
    id: 'multi-all-absent',
    question: '기초연금이랑 의료급여 알려줘',
    docs: [{ title: '노인일자리', content: '[정책명] 노인일자리 ...' }],
    expectLowConfidence: true,
  },
];
