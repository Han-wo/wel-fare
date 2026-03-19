const TIMEZONE_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/;

function normalizeServerDateString(value: string) {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return TIMEZONE_SUFFIX.test(normalized) ? normalized : `${normalized}Z`;
}

export function parseServerDate(value: string | Date) {
  if (value instanceof Date) return value;

  const parsed = new Date(normalizeServerDateString(value));
  return parsed;
}

export function formatRelativeKoreanTime(value: string | Date) {
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMinutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));

  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffMinutes < 60 * 24) return `${Math.floor(diffMinutes / 60)}시간 전`;

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

export function formatClockKorean(value: string | Date) {
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
