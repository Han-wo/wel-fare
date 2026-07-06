/**
 * 그라운딩 위반의 정정 부록(corrective appendix) 순수 로직.
 *
 * 답변은 토큰 단위로 이미 스트리밍된 뒤라 본문을 고쳐 쓸 수 없다. 그래서
 * 교정은 "부록 덧붙이기"로 한다 — 링크 캐비엇(buildLinkCaveat)과 같은 원리.
 * 근거 없는 정책명이 감지되면 LLM이 짧은 정정 안내를 쓰고, LLM이 실패하면
 * 결정적 문구로 폴백한다. 어느 쪽이든 사용자는 근거 없는 정책명을
 * 그대로 믿지 않게 된다.
 */

export function buildDeterministicPolicyCorrection(policyNames: string[]): string {
  return [
    '',
    '',
    '> ⚠️ **정정 안내**: 위 답변의 다음 정책명은 검색된 공식 근거에서 확인되지 않았습니다.',
    ...policyNames.map((name) => `> - ${name}`),
    '> 정부24·복지로 등 공식 사이트에서 정확한 명칭과 내용을 확인해 주세요.',
  ].join('\n');
}

// LLM이 생성한 정정 문장을 캐비엇과 같은 블록쿼트 형태로 감싼다.
export function formatCorrectionAppendix(text: string): string {
  const lines = text
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith('>') ? line : `> ${line}`));

  return ['', '', '> ⚠️ **정정 안내**:', ...lines].join('\n');
}

// LLM 정정 프롬프트에 넣을 근거 문서 다이제스트(제목만, 중복 제거).
export function buildDocsDigest(titles: Array<string | null | undefined>, limit = 10): string {
  const uniq = [...new Set(titles.filter((t): t is string => Boolean(t?.trim())))].slice(0, limit);
  return uniq.length > 0 ? uniq.map((t) => `- ${t}`).join('\n') : '- (근거 문서 없음)';
}
