import { differenceInYears, differenceInDays, format, parseISO } from 'date-fns';

export function calcAge(birthDate: string): number {
  return differenceInYears(new Date(), parseISO(birthDate));
}

export function formatDate(date: string | Date, fmt = 'yyyy.MM.dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt);
}

export function dDayLabel(endDate: string): string {
  const diff = differenceInDays(parseISO(endDate), new Date());
  if (diff < 0) return '마감';
  if (diff === 0) return 'D-Day';
  return `D-${diff}`;
}
