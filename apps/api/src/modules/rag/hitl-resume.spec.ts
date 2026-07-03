import { describe, expect, it } from '@jest/globals';
import {
  buildPendingHitlMeta,
  extractPendingHitl,
  resolveHitlResume,
  type PendingHitl,
} from './hitl-resume';

const PENDING: PendingHitl = {
  originalQuestion: '내가 받을 수 있는 주거 지원 알려줘',
  routeType: 'ELIGIBILITY',
  reason: 'missing_profile',
  source: 'request_missing_info',
  questionnaireId: 'missing_x',
  missingFields: ['region', 'age'],
};

describe('extractPendingHitl', () => {
  it('buildPendingHitlMeta로 저장한 메타를 복원한다', () => {
    const meta = buildPendingHitlMeta(PENDING);
    expect(extractPendingHitl(meta)).toEqual(PENDING);
  });

  it('originalQuestion/routeType 없는 구버전 메타는 재개 대상이 아니다', () => {
    expect(
      extractPendingHitl({ hitl: { reason: 'no_results', source: 'verify_answer' } }),
    ).toBeNull();
    expect(extractPendingHitl(null)).toBeNull();
    expect(extractPendingHitl({ other: true })).toBeNull();
  });
});

describe('resolveHitlResume', () => {
  it('HITL 패널 합성 답변이면 원래 라우트로 복원하고 질문을 병합한다', () => {
    const decision = resolveHitlResume(
      PENDING,
      '방금 확인한 정보로 다시 찾아주세요 — 지역: 서울, 나이대: 30대',
    );

    expect(decision).not.toBeNull();
    expect(decision?.routeType).toBe('ELIGIBILITY');
    expect(decision?.skipped).toBe(false);
    expect(decision?.supplement).toBe('지역: 서울, 나이대: 30대');
    expect(decision?.effectiveQuestion).toBe(
      '내가 받을 수 있는 주거 지원 알려줘\n[사용자 보충 정보] 지역: 서울, 나이대: 30대',
    );
  });

  it('패널 건너뛰기 답변이면 원래 질문 그대로 재개한다', () => {
    const decision = resolveHitlResume(PENDING, '방금 답변은 건너뛸게요. 기존 정보로 다시 찾아주세요.');

    expect(decision?.skipped).toBe(true);
    expect(decision?.effectiveQuestion).toBe(PENDING.originalQuestion);
    expect(decision?.routeType).toBe('ELIGIBILITY');
  });

  it('입력창에 직접 친 짧은 필드형 답변도 보충으로 인식한다', () => {
    const decision = resolveHitlResume(PENDING, '만 27세고 서울 살아요');

    expect(decision).not.toBeNull();
    expect(decision?.supplement).toBe('만 27세고 서울 살아요');
    expect(decision?.effectiveQuestion).toContain('[사용자 보충 정보] 만 27세고 서울 살아요');
  });

  it('새 질문으로 보이는 메시지는 재개하지 않는다', () => {
    expect(resolveHitlResume(PENDING, '서울 청년수당 신청 방법 알려줘')).toBeNull();
    expect(resolveHitlResume(PENDING, '기초연금은 얼마나 받아?')).toBeNull();
  });

  it('pending이 없으면 항상 null', () => {
    expect(
      resolveHitlResume(null, '방금 확인한 정보로 다시 찾아주세요 — 지역: 서울'),
    ).toBeNull();
  });
});
