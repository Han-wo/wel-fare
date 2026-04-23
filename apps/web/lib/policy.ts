export interface PolicyRequirement {
  id: string;
  requirementType: string;
  description: string;
}

export interface Policy {
  id: string;
  externalId?: string;
  source: string;
  name: string;
  category: string;
  subcategory?: string;
  provider?: string;
  summary?: string;
  content?: string;
  targetSummary?: string;
  benefitAmount?: number | string | null;
  benefitType?: string;
  applicationStart?: string | null;
  applicationEnd?: string | null;
  status: string;
  applyUrl?: string;
  contact?: string;
  sidoCodes?: string[];
  tags?: string[];
  requirements?: PolicyRequirement[];
  viewCount?: number;
  applyCount?: number;
  createdAt?: string;
  updatedAt?: string;
  syncedAt?: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  HOUSING: '주거',
  JOB: '일자리',
  CARE: '돌봄',
  HEALTH: '건강',
  FINANCE: '금융',
  EDUCATION: '교육',
  WELFARE: '복지',
  YOUTH: '청년',
  ELDERLY: '노인',
  FAMILY: '가족',
  CULTURE: '문화',
};

export function categoryLabel(category?: string | null) {
  if (!category) return '정책';
  return CATEGORY_LABEL[category] ?? category;
}

export function formatDeadline(applicationEnd?: string | null): string {
  if (!applicationEnd) return '상시';
  const end = new Date(applicationEnd);
  if (Number.isNaN(end.getTime())) return '상시';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return '마감';
  if (diffDays === 0) return 'D-DAY';
  if (diffDays <= 30) return `D-${diffDays}`;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(end);
}

export function deadlineTag(applicationEnd?: string | null): {
  label: string;
  kind: 'accent' | 'warning' | 'danger' | 'default';
} {
  if (!applicationEnd) return { label: '상시', kind: 'default' };
  const end = new Date(applicationEnd);
  if (Number.isNaN(end.getTime())) return { label: '상시', kind: 'default' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: '마감', kind: 'danger' };
  if (diffDays <= 7) return { label: `D-${diffDays}`, kind: 'danger' };
  if (diffDays <= 30) return { label: `D-${diffDays}`, kind: 'warning' };
  return { label: formatDeadline(applicationEnd), kind: 'default' };
}

export function formatAmount(amount?: number | string | null, type?: string): string {
  if (amount == null || amount === '') return '-';
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(num) || num <= 0) return type ? String(type) : '-';
  if (num >= 100_000_000) {
    return `${(num / 100_000_000).toFixed(1).replace(/\.0$/, '')}억원`;
  }
  if (num >= 10_000) {
    return `${Math.round(num / 10_000).toLocaleString()}만원`;
  }
  return `${num.toLocaleString()}원`;
}
