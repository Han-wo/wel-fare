import { describe, expect, it } from '@jest/globals';
import {
  buildDeterministicPolicyCorrection,
  buildDocsDigest,
  formatCorrectionAppendix,
} from './grounded-repair';

describe('grounded-repair', () => {
  it('결정적 정정 문구는 확인 안 된 정책명을 전부 나열한다', () => {
    const text = buildDeterministicPolicyCorrection(['가짜정책A', '가짜정책B']);
    expect(text).toContain('정정 안내');
    expect(text).toContain('가짜정책A');
    expect(text).toContain('가짜정책B');
    expect(text).toContain('정부24');
  });

  it('LLM 정정 문장을 블록쿼트 부록으로 감싼다', () => {
    const appendix = formatCorrectionAppendix('청년월세2.0은 확인되지 않았습니다.\n청년월세 한시 특별지원을 확인하세요.');
    const lines = appendix.split('\n').filter(Boolean);
    expect(lines[0]).toBe('> ⚠️ **정정 안내**:');
    expect(lines.slice(1).every((line) => line.startsWith('>'))).toBe(true);
  });

  it('docs 다이제스트는 제목을 중복 제거하고 상한을 지킨다', () => {
    const digest = buildDocsDigest(['A', 'A', null, undefined, 'B', ' '], 10);
    expect(digest).toBe('- A\n- B');

    const many = buildDocsDigest(Array.from({ length: 20 }, (_, i) => `정책${i}`), 3);
    expect(many.split('\n')).toHaveLength(3);
  });

  it('제목이 없으면 근거 없음 표시', () => {
    expect(buildDocsDigest([])).toContain('근거 문서 없음');
  });
});
