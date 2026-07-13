import { describe, expect, it } from '@jest/globals';
import {
  buildDeadlineDraft,
  buildMatchDigestDraft,
  calcAgeFromBirthDate,
  daysUntil,
  policyMatchesProfile,
} from './notification-rules';

const NOW = new Date('2026-07-07T10:00:00+09:00');

describe('daysUntil', () => {
  it('computes remaining days at midnight granularity', () => {
    expect(daysUntil('2026-07-08', NOW)).toBe(1);
    expect(daysUntil('2026-07-14', NOW)).toBe(7);
    expect(daysUntil('2026-07-07', NOW)).toBe(0);
  });

  it('returns null for past or invalid dates', () => {
    expect(daysUntil('2026-07-01', NOW)).toBeNull();
    expect(daysUntil('not-a-date', NOW)).toBeNull();
    expect(daysUntil(null, NOW)).toBeNull();
  });
});

describe('buildDeadlineDraft', () => {
  it('builds a deduped deadline notification', () => {
    const draft = buildDeadlineDraft({
      userId: 'u1',
      policyId: 'p1',
      policyName: '청년월세 지원',
      applicationEnd: '2026-07-10',
      dDay: 3,
    });
    expect(draft.type).toBe('deadline');
    expect(draft.title).toContain('D-3');
    expect(draft.title).toContain('청년월세 지원');
    expect(draft.dedupeKey).toBe('deadline:u1:p1:3');
  });
});

describe('policyMatchesProfile', () => {
  const profile = { userId: 'u1', sidoCode: '41', age: 27 };

  it('treats empty sidoCodes as nationwide', () => {
    expect(
      policyMatchesProfile({ id: 'p', name: 'n', sidoCodes: null, minAge: null, maxAge: null }, profile),
    ).toBe(true);
  });

  it('filters by region when sidoCodes present', () => {
    expect(
      policyMatchesProfile({ id: 'p', name: 'n', sidoCodes: ['11'], minAge: null, maxAge: null }, profile),
    ).toBe(false);
    expect(
      policyMatchesProfile({ id: 'p', name: 'n', sidoCodes: ['11', '41'], minAge: null, maxAge: null }, profile),
    ).toBe(true);
  });

  it('filters by age range when AGE requirement exists', () => {
    expect(
      policyMatchesProfile({ id: 'p', name: 'n', sidoCodes: null, minAge: 19, maxAge: 34 }, profile),
    ).toBe(true);
    expect(
      policyMatchesProfile({ id: 'p', name: 'n', sidoCodes: null, minAge: 65, maxAge: null }, profile),
    ).toBe(false);
  });

  it('passes age check when profile age unknown', () => {
    expect(
      policyMatchesProfile(
        { id: 'p', name: 'n', sidoCodes: null, minAge: 19, maxAge: 34 },
        { userId: 'u1', sidoCode: '41', age: null },
      ),
    ).toBe(true);
  });
});

describe('buildMatchDigestDraft', () => {
  it('returns null when nothing matched', () => {
    expect(buildMatchDigestDraft({ userId: 'u1', policies: [], dateKey: '2026-07-07' })).toBeNull();
  });

  it('aggregates multiple policies into one daily digest', () => {
    const draft = buildMatchDigestDraft({
      userId: 'u1',
      policies: [
        { id: 'a', name: '정책A' },
        { id: 'b', name: '정책B' },
        { id: 'c', name: '정책C' },
        { id: 'd', name: '정책D' },
      ],
      dateKey: '2026-07-07',
    });
    expect(draft?.type).toBe('match');
    expect(draft?.title).toContain('4건');
    expect(draft?.body).toContain('외 1건');
    expect(draft?.dedupeKey).toBe('match:u1:2026-07-07');
    expect(draft?.policyId).toBeNull();
  });

  it('links directly to the policy when only one matched', () => {
    const draft = buildMatchDigestDraft({
      userId: 'u1',
      policies: [{ id: 'a', name: '정책A' }],
      dateKey: '2026-07-07',
    });
    expect(draft?.policyId).toBe('a');
    expect(draft?.title).toContain('정책A');
  });
});

describe('calcAgeFromBirthDate', () => {
  it('computes age with birthday adjustment', () => {
    expect(calcAgeFromBirthDate('1999-01-01', NOW)).toBe(27);
    expect(calcAgeFromBirthDate('1999-12-31', NOW)).toBe(26);
    expect(calcAgeFromBirthDate(null, NOW)).toBeNull();
  });
});
