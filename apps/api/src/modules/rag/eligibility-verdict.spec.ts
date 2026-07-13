import { describe, expect, it } from '@jest/globals';
import type { UserProfile } from '@welfare-ai/shared-types';
import { missingProfileFields, parseEligibilityVerdict } from './eligibility-verdict';

describe('parseEligibilityVerdict', () => {
  it('parses the first-line verdict tag', () => {
    expect(parseEligibilityVerdict('[가능] 모든 조건을 충족합니다.')).toBe('possible');
    expect(parseEligibilityVerdict('[불확실] 소득 정보가 없어 판정 불가.')).toBe('uncertain');
    expect(parseEligibilityVerdict('[어려움] 소득 기준과 충돌합니다.')).toBe('difficult');
  });

  it('skips leading blank lines', () => {
    expect(parseEligibilityVerdict('\n\n[가능] 충족합니다.')).toBe('possible');
  });

  it('returns null when the contract is violated', () => {
    expect(parseEligibilityVerdict('조건을 충족하는 것으로 보입니다.')).toBeNull();
    expect(parseEligibilityVerdict('')).toBeNull();
    expect(parseEligibilityVerdict(null)).toBeNull();
    expect(parseEligibilityVerdict('본문 중간에 [불확실] 이 있어도 무시')).toBeNull();
  });
});

describe('missingProfileFields', () => {
  const base = {
    birthDate: '1999-01-01',
    sidoCode: '41',
    incomeBracket: 80,
  } as unknown as UserProfile;

  it('returns nothing for a complete profile', () => {
    expect(missingProfileFields(base)).toEqual([]);
  });

  it('detects missing fields', () => {
    expect(missingProfileFields({ ...base, birthDate: undefined } as UserProfile)).toEqual(['age']);
    expect(missingProfileFields({ ...base, sidoCode: undefined } as UserProfile)).toEqual(['region']);
    expect(
      missingProfileFields({ ...base, incomeBracket: undefined } as UserProfile),
    ).toEqual(['income']);
  });

  it('treats a null profile as missing everything', () => {
    expect(missingProfileFields(null)).toEqual(['age', 'region', 'income']);
  });

  it('counts HITL facts as provided', () => {
    const withFacts = {
      ...base,
      birthDate: undefined,
      hitlFacts: { age: '20대' },
    } as unknown as UserProfile;
    expect(missingProfileFields(withFacts)).toEqual([]);
  });
});
