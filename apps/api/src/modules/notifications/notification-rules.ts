/**
 * 알림 생성 규칙 — 순수 함수 모음.
 * 스케줄러(notification-scheduler.service)가 DB 조회 결과를 이 규칙에 통과시켜
 * 생성할 알림 페이로드를 얻는다. DB 접근 없음.
 */

export const DEADLINE_THRESHOLDS = [7, 3, 1] as const;

/** 하루 최대 match 알림 1건(다이제스트)에 담을 정책 수 */
export const MATCH_DIGEST_LIMIT = 3;

export interface NotificationDraft {
  userId: string;
  type: 'deadline' | 'match';
  title: string;
  body: string;
  policyId: string | null;
  dedupeKey: string;
}

/** now 기준 마감일까지 남은 일수(자정 기준). 과거·파싱 불가는 null */
export function daysUntil(dateStr: string | null | undefined, now: Date): number | null {
  if (!dateStr) return null;
  const end = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  const diff = Math.round((endDay.getTime() - today.getTime()) / 86_400_000);
  return diff >= 0 ? diff : null;
}

export function buildDeadlineDraft(input: {
  userId: string;
  policyId: string;
  policyName: string;
  applicationEnd: string;
  dDay: number;
}): NotificationDraft {
  return {
    userId: input.userId,
    type: 'deadline',
    title: `D-${input.dDay} · ${input.policyName}`,
    body: `저장하신 정책의 신청 마감이 ${input.dDay}일 남았습니다. 마감일: ${input.applicationEnd}`,
    policyId: input.policyId,
    dedupeKey: `deadline:${input.userId}:${input.policyId}:${input.dDay}`,
  };
}

export interface MatchablePolicy {
  id: string;
  name: string;
  sidoCodes: string[] | null;
  minAge: number | null;
  maxAge: number | null;
}

export interface MatchableProfile {
  userId: string;
  sidoCode: string | null;
  age: number | null;
}

/**
 * 신규 정책이 프로필에 맞는지 판정.
 * - 지역: 정책 sidoCodes가 비어 있으면 전국으로 간주. 있으면 프로필 지역 포함 필요.
 * - 나이: AGE 요구조건이 있으면 프로필 나이가 범위 안이어야 함. 나이 미상이면 통과
 *   (과소 알림보다 과대 알림이 낫고, 상세 판정은 자격확인 그래프의 몫).
 */
export function policyMatchesProfile(policy: MatchablePolicy, profile: MatchableProfile): boolean {
  if (policy.sidoCodes && policy.sidoCodes.length > 0) {
    if (!profile.sidoCode || !policy.sidoCodes.includes(profile.sidoCode)) return false;
  }
  if (profile.age !== null) {
    if (policy.minAge !== null && profile.age < policy.minAge) return false;
    if (policy.maxAge !== null && profile.age > policy.maxAge) return false;
  }
  return true;
}

/** 하루 1건 다이제스트: 여러 신규 매칭 정책을 한 알림으로 묶는다 */
export function buildMatchDigestDraft(input: {
  userId: string;
  policies: Array<{ id: string; name: string }>;
  dateKey: string; // yyyy-mm-dd (KST)
}): NotificationDraft | null {
  if (input.policies.length === 0) return null;
  const names = input.policies.slice(0, MATCH_DIGEST_LIMIT).map((p) => p.name);
  const rest = input.policies.length - names.length;
  const title =
    input.policies.length === 1
      ? `내 조건에 맞는 새 정책: ${names[0]}`
      : `내 조건에 맞는 새 정책 ${input.policies.length}건`;
  const body =
    names.join(', ') + (rest > 0 ? ` 외 ${rest}건이 새로 등록되었습니다.` : '이(가) 새로 등록되었습니다.');
  return {
    userId: input.userId,
    type: 'match',
    title,
    body,
    policyId: input.policies.length === 1 ? input.policies[0].id : null,
    dedupeKey: `match:${input.userId}:${input.dateKey}`,
  };
}

export function kstDateKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
}

export function calcAgeFromBirthDate(birthDate: string | null | undefined, now: Date): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}
