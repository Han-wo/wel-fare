import { calcAge, getSidoName } from '@welfare-ai/shared-utils';
import type { UserProfile as UserProfileType } from '@welfare-ai/shared-types';
import type { RetrievalItem } from './retrieval.types';

export function formatEligibilityProfile(profile: UserProfileType) {
  return [
    `나이: ${profile.birthDate ? calcAge(profile.birthDate) : '미입력'}세`,
    `거주지: ${profile.sidoCode ? getSidoName(profile.sidoCode) : '미입력'}`,
    `소득: 중위소득 ${profile.incomeBracket ?? '미입력'}% 이하`,
    `가구형태: ${profile.householdType ?? '미입력'}`,
    `주택: ${profile.isHomeowner ? '자가' : '무주택'}`,
    profile.isDisabled ? '장애인' : '',
    profile.isVeteran ? '국가유공자' : '',
  ]
    .filter(Boolean)
    .join(', ');
}

export function dedupeItems(items: RetrievalItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.id || item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toRetrievalItem(
  payload: Record<string, unknown>,
  score: number | null | undefined,
  index: number,
): RetrievalItem {
  const id = extractPolicyIdFromPayload(payload, index);
  const title = extractTraceLabel(payload, index);
  const source = typeof payload.source === 'string' ? payload.source : 'unknown';
  const kind = mapTraceKind(source);
  const content =
    (typeof payload.content === 'string' && payload.content) ||
    (typeof payload.text === 'string' && payload.text) ||
    `[제목] ${title}`;

  return {
    id,
    title,
    source,
    kind,
    score: score ?? null,
    content,
    metadata: { ...payload, score: score ?? null },
  };
}

export function ageToLifeStage(age: number): string {
  if (age <= 5) return '영유아';
  if (age <= 12) return '아동';
  if (age <= 18) return '청소년';
  if (age <= 34) return '청년';
  if (age <= 64) return '중장년';
  return '노년';
}

export function profileToTargetGroups(profile: UserProfileType): string[] {
  const groups: string[] = [];
  if ((profile.incomeBracket ?? 200) <= 50) groups.push('저소득');
  if (profile.householdType === 'SINGLE_PARENT' || profile.isSingleParent) groups.push('한부모·조손');
  if (profile.isDisabled) groups.push('장애인');
  if (profile.hasChildren && (profile.childrenCount ?? 0) >= 3) groups.push('다자녀');
  if (profile.isVeteran) groups.push('보훈대상자');
  return groups;
}

export function buildProfileText(profile: UserProfileType, age: number): string {
  const parts: string[] = [
    `${age}세`,
    profile.sidoCode ? `${getSidoName(profile.sidoCode)} 거주` : '',
    profile.householdType === 'SINGLE'
      ? '1인 가구'
      : profile.householdType === 'SINGLE_PARENT'
        ? '한부모가정'
        : profile.householdType === 'COUPLE'
          ? '부부 가구'
          : '가족 가구',
    profile.occupationType === 'UNEMPLOYED'
      ? '구직 중'
      : profile.occupationType === 'STUDENT'
        ? '학생'
        : profile.occupationType === 'EMPLOYEE'
          ? '직장인'
          : profile.occupationType ?? '',
    `중위소득 ${profile.incomeBracket ?? 100}% 이하`,
    profile.isHomeowner ? '자가 보유' : '무주택',
    profile.isDisabled ? '장애인' : '',
    profile.isVeteran ? '국가보훈대상자' : '',
    profile.hasChildren ? `자녀 ${profile.childrenCount ?? 1}명` : '',
  ].filter(Boolean);
  return `${parts.join(' ')} 복지 지원 정책 혜택`;
}

export function extractPolicyName(text: string): string | null {
  const patterns = [
    /\[정책명\]\s*(.+)/,
    /\[서비스명\]\s*(.+)/,
    /\[시설명\]\s*(.+)/,
    /\[단지명\]\s*(.+)/,
    /\[공고명\]\s*(.+)/,
    /정책명[:：]\s*(.+)/,
    /서비스명[:：]\s*(.+)/,
  ];

  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (matched?.[1]) {
      return matched[1].trim().split('\n')[0].trim();
    }
  }

  return null;
}

export function policyNodeId(value: string) {
  return `entity:${value}`;
}

export function extractPolicyIdFromPayload(payload: Record<string, unknown>, index: number) {
  const raw =
    payload.policyId ??
    payload.id ??
    payload.announcementId ??
    payload.facilityId ??
    payload.complexId;

  return typeof raw === 'string' && raw.length > 0 ? raw : `vector-hit-${index}`;
}

export function extractTraceLabel(payload: Record<string, unknown>, index: number) {
  const nameCandidate = [payload.name, payload.title, payload.policyName, payload.facilityName].find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );

  if (typeof nameCandidate === 'string') {
    return nameCandidate.trim();
  }

  const contentCandidate =
    (typeof payload.content === 'string' && payload.content) ||
    (typeof payload.text === 'string' && payload.text) ||
    '';
  const extracted = extractPolicyName(contentCandidate);
  if (extracted) return extracted;

  return `문서 ${index + 1}`;
}

export function mapTraceKind(source: string | null) {
  switch (source) {
    case 'bokjiro':
    case 'local_bokjiro':
    case 'youth_center':
      return 'Policy';
    case 'welfare_facility':
      return 'WelfareFacility';
    case 'lh_housing':
    case 'housing_complex':
      return 'HousingComplex';
    case 'housing_announcement':
    case 'applyhome':
    case 'myhome_announcement':
    case 'applyhome_cmpet':
    case 'applyhome_stat':
      return 'HousingAnnouncement';
    default:
      return 'Document';
  }
}

const QUESTION_TEMPLATES = [
  (name: string) => `${name} 신청 방법 알려줘`,
  (name: string) => `${name} 받을 수 있는 조건이 어떻게 되나요?`,
  (name: string) => `${name} 지원 신청하려면 어떻게 해야 하나요?`,
  (name: string) => `${name}에 대해 자세히 알려줘`,
];

export function buildSuggestions(policyNames: string[], profile: UserProfileType, age: number): string[] {
  const set = new Set<string>();

  if (!profile.isHomeowner) set.add('무주택자 공공임대주택 신청 방법 알려줘');
  if (age >= 19 && age <= 34) set.add('청년 월세 보조금 신청 조건이 어떻게 되나요?');
  if (age >= 65) set.add('기초연금 신청 방법과 지급액 알려줘');
  if ((profile.incomeBracket ?? 200) <= 50) set.add('차상위계층 지원 혜택 전부 알려줘');
  if (profile.isDisabled) set.add('장애인 활동지원서비스 신청 방법 알려줘');
  if (profile.hasChildren) set.add('아이돌봄 서비스 신청 자격과 방법 알려줘');
  if (profile.occupationType === 'UNEMPLOYED') set.add('실업급여 신청 조건과 방법 알려줘');
  if (profile.isSingleParent || profile.householdType === 'SINGLE_PARENT') {
    set.add('한부모가정 양육비 지원 받을 수 있나요?');
  }
  if (profile.isVeteran) set.add('국가보훈대상자 의료비 지원 알려줘');
  if (age >= 35 && age <= 55 && profile.occupationType === 'UNEMPLOYED') {
    set.add('중장년 재취업 지원 프로그램 알려줘');
  }

  policyNames.slice(0, 4).forEach((name, index) => {
    set.add(QUESTION_TEMPLATES[index % QUESTION_TEMPLATES.length](name));
  });

  set.add('내 조건에 맞는 복지 혜택 전체 목록 보여줘');
  return Array.from(set).slice(0, 6);
}

export const DEFAULT_SUGGESTIONS = [
  '청년 월세 보조금 신청 방법 알려줘',
  '저소득층 의료비 지원 정책이 있나요?',
  '무주택자 공공임대주택 신청 방법 알려줘',
  '실업급여 신청 조건과 방법 알려줘',
  '기초연금 신청 방법과 지급액 알려줘',
  '내 조건에 맞는 복지 혜택 전체 목록 보여줘',
];
