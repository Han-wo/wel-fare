import { describe, expect, it } from '@jest/globals';
import { chunkPolicyContent, CHUNK_THRESHOLD } from './content-chunking';

const short = `[정책명] 기초연금
[주관부처] 보건복지부
[개요] 만 65세 이상 어르신께 매달 연금을 드립니다.`;

// 실제 코퍼스의 가장 긴 문서 구조를 본뜬 것 — 신청자격·제외대상이
// 전체의 3분의 2를 차지하는 형태.
const long = [
  '[정책명] 청년 주거안정 월세대출',
  '[주관기관] 국토교통부',
  `[신청자격] ${'가'.repeat(1000)}`,
  `[신청 제외 대상] ${'나'.repeat(1000)}`,
  '[신청링크] https://example.kr/apply',
].join('\n');

describe('chunkPolicyContent', () => {
  it('짧은 문서는 자르지 않는다', () => {
    expect(chunkPolicyContent(short)).toEqual([short]);
  });

  it('임계값 경계에서 그대로 둔다', () => {
    const text = `[정책명] X\n[개요] ${'가'.repeat(CHUNK_THRESHOLD - 20)}`;
    expect(text.length).toBeLessThanOrEqual(CHUNK_THRESHOLD);
    expect(chunkPolicyContent(text)).toHaveLength(1);
  });

  it('긴 문서는 섹션 경계로 나눈다', () => {
    const chunks = chunkPolicyContent(long);
    expect(chunks.length).toBeGreaterThan(1);
    // 섹션 중간이 끊기면 안 된다 — 모든 조각이 [로 시작하는 줄들로만 구성
    for (const c of chunks) {
      expect(c.startsWith('[')).toBe(true);
    }
  });

  it('모든 조각이 정책명을 머리에 갖는다', () => {
    const chunks = chunkPolicyContent(long);
    for (const c of chunks) {
      expect(c).toContain('[정책명] 청년 주거안정 월세대출');
    }
  });

  it('첫 조각에 정책명이 중복되지 않는다', () => {
    const first = chunkPolicyContent(long)[0];
    const occurrences = first.split('[정책명]').length - 1;
    expect(occurrences).toBe(1);
  });

  it('내용이 유실되지 않는다', () => {
    const chunks = chunkPolicyContent(long);
    const joined = chunks.join('\n');
    expect(joined).toContain('가'.repeat(1000));
    expect(joined).toContain('나'.repeat(1000));
    expect(joined).toContain('https://example.kr/apply');
  });

  // 한 섹션이 통째로 상한을 넘어도 문장 중간을 끊지 않는다.
  it('상한을 넘는 단일 섹션은 그대로 유지한다', () => {
    const huge = `[정책명] Y\n[지원내용] ${'다'.repeat(3000)}`;
    const chunks = chunkPolicyContent(huge);
    expect(chunks.join('\n')).toContain('다'.repeat(3000));
  });

  it('섹션 마커가 없으면 쪼개지 않는다', () => {
    const plain = '가'.repeat(2000);
    expect(chunkPolicyContent(plain)).toEqual([plain]);
  });
});
