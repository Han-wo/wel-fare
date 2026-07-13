/**
 * 자격 판정 답변의 구조화 해석 — 순수 로직.
 *
 * ELIGIBILITY_SYSTEM_PROMPT가 강제하는 첫 줄 판정 태그([가능]/[불확실]/[어려움])를
 * 결정적으로 파싱하고, [불확실]일 때 무엇을 되물어야 하는지를 프로필의 미입력
 * 필드에서 도출한다. 정규식으로 답변 본문을 추측하던 기존 안전망과 달리
 * 프롬프트 계약 그 자체를 소비하므로 오탐이 없다.
 *
 * 태그 계약을 바꾸면 prompts.ts, answer-format.ts와 함께 바꿔야 한다.
 */
import type { UserProfile } from '@welfare-ai/shared-types';
import { getHitlFacts } from './profile-facts';

export type EligibilityVerdict = 'possible' | 'uncertain' | 'difficult';

const VERDICT_RE = /^\[(가능|불확실|어려움)\]/;

const VERDICT_MAP: Record<string, EligibilityVerdict> = {
  가능: 'possible',
  불확실: 'uncertain',
  어려움: 'difficult',
};

export function parseEligibilityVerdict(answer: string | null | undefined): EligibilityVerdict | null {
  if (!answer) return null;
  const firstLine = answer
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  const match = VERDICT_RE.exec(firstLine);
  return match ? VERDICT_MAP[match[1]] : null;
}

export type ProfileMissingField = 'age' | 'region' | 'income';

/**
 * [불확실] 판정에서 되물을 수 있는 프로필 미입력 필드.
 * HITL로 이미 확보한 사실(hitlFacts)이 있으면 미입력으로 치지 않는다.
 * 비어 있으면 부족한 건 사용자 정보가 아니라 문서 측 확인 사항이라는 뜻이므로
 * 되묻지 않는다 (답변 본문이 확인 경로를 이미 안내한다).
 */
export function missingProfileFields(profile: UserProfile | null): ProfileMissingField[] {
  const facts = getHitlFacts(profile);
  const missing: ProfileMissingField[] = [];
  if (!profile?.birthDate && !facts.age) missing.push('age');
  if (!profile?.sidoCode && !facts.region) missing.push('region');
  if ((profile?.incomeBracket === null || profile?.incomeBracket === undefined) && !facts.income) {
    missing.push('income');
  }
  return missing;
}
