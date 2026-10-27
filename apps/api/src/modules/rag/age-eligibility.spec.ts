import { describe, expect, it } from '@jest/globals';
import { assessAge, formatAgeVerdictLine } from './age-eligibility';

describe('assessAge', () => {
  const range = { minValue: 19, maxValue: 34, description: '만 19세 ~ 만 34세' };

  it('범위 안이면 MATCH', () => {
    expect(assessAge(27, range).verdict).toBe('MATCH');
  });

  it('경계값은 포함이다', () => {
    expect(assessAge(19, range).verdict).toBe('MATCH');
    expect(assessAge(34, range).verdict).toBe('MATCH');
  });

  it('범위를 벗어나면 MISMATCH와 사유', () => {
    const over = assessAge(36, range);
    expect(over.verdict).toBe('MISMATCH');
    expect(over.reason).toContain('만 19세 ~ 만 34세');
    expect(over.reason).toContain('만 36세');

    expect(assessAge(18, range).verdict).toBe('MISMATCH');
  });

  // 3치의 핵심 — "모름"은 탈락이 아니다. 생년월일 미입력 사용자에게서
  // 모든 정책이 사라지면 안 된다.
  it('나이를 모르면 UNKNOWN', () => {
    expect(assessAge(null, range).verdict).toBe('UNKNOWN');
    expect(assessAge(undefined, range).verdict).toBe('UNKNOWN');
    expect(assessAge(NaN, range).verdict).toBe('UNKNOWN');
  });

  it('조건이 없으면 UNKNOWN', () => {
    expect(assessAge(30, null).verdict).toBe('UNKNOWN');
    expect(assessAge(30, { minValue: null, maxValue: null }).verdict).toBe('UNKNOWN');
  });

  it('한쪽만 있는 범위도 평가한다', () => {
    expect(assessAge(30, { minValue: 40, maxValue: null }).verdict).toBe('MISMATCH');
    expect(assessAge(45, { minValue: 40, maxValue: null }).verdict).toBe('MATCH');
    expect(assessAge(45, { minValue: null, maxValue: 40 }).verdict).toBe('MISMATCH');
  });

  // 온통청년 원천은 "제한 없음"을 0으로 보낸다. 코퍼스 2,785건 중 685건이
  // 0~0이라 이걸 실제 범위로 읽으면 연령 무관 정책이 전부 미해당으로 뒤집힌다.
  describe('0은 제한 없음 센티널이다', () => {
    it('0~0은 조건 없음으로 본다 (K-패스 등 연령 무관 정책)', () => {
      const r = { minValue: 0, maxValue: 0, description: '만 0세 ~ 만 0세' };
      expect(assessAge(36, r).verdict).toBe('UNKNOWN');
      expect(assessAge(70, r).verdict).toBe('UNKNOWN');
    });

    it('max만 0이면 하한만 평가한다', () => {
      const r = { minValue: 15, maxValue: 0, description: '만 15세 ~ 만 0세' };
      expect(assessAge(36, r).verdict).toBe('MATCH');
      expect(assessAge(10, r).verdict).toBe('MISMATCH');
    });

    it('min만 0이면 상한만 평가한다', () => {
      const r = { minValue: 0, maxValue: 39, description: '만 0세 ~ 만 39세' };
      expect(assessAge(36, r).verdict).toBe('MATCH');
      expect(assessAge(45, r).verdict).toBe('MISMATCH');
    });

    it('센티널이 섞인 원문 표기는 사유에 인용하지 않는다', () => {
      const r = { minValue: 15, maxValue: 0, description: '만 15세 ~ 만 0세' };
      const reason = assessAge(10, r).reason ?? '';
      expect(reason).not.toContain('만 0세');
      expect(reason).toContain('만 15세 이상');
    });
  });

  it('description이 없으면 범위로 문장을 만든다', () => {
    const reason = assessAge(50, { minValue: 19, maxValue: 34 }).reason;
    expect(reason).toContain('만 19세 ~ 만 34세');
  });
});

describe('formatAgeVerdictLine', () => {
  it('MISMATCH는 사유가 담긴 줄을 만든다', () => {
    const line = formatAgeVerdictLine(assessAge(36, { minValue: 19, maxValue: 34 }));
    expect(line).toContain('[연령 판정] 미해당');
    expect(line).toContain('만 36세');
  });

  it('UNKNOWN은 본문에 아무것도 붙이지 않는다', () => {
    expect(formatAgeVerdictLine({ verdict: 'UNKNOWN', reason: null })).toBeNull();
  });
});
