/**
 * 정책 본문 청킹.
 *
 * 시더가 만드는 본문은 `[섹션] 내용` 형태로 이미 구조화돼 있어
 * (정책명 / 지원대상 / 선정기준 / 지원내용 / 신청방법 …) 고정 길이로
 * 자르는 대신 섹션 경계에서 나눈다. 실측한 가장 긴 문서(3,126자)는
 * 15개 섹션이고 그중 "신청자격"(1,068자) "신청 제외 대상"(1,037자)이
 * 3분의 2를 차지했다 — 조항 단위 질문("소득 요건이 뭐야")이
 * 전체 문서 한 벡터에 희석되던 지점이다.
 *
 * 설계 원칙:
 *  - 짧은 문서는 자르지 않는다. 코퍼스 평균이 297~584자라 더 쪼개면
 *    조각이 제목만 남아 오히려 검색이 나빠진다.
 *  - 모든 조각에 정책명을 머리에 붙인다. 조각만 떼어 봐도 어느 정책
 *    이야기인지 알 수 있어야 하고, 답변 인용 시에도 출처가 유지된다.
 *  - 한 섹션이 통째로 상한을 넘으면 더 쪼개지 않고 그대로 둔다.
 *    문장 중간을 끊으면 의미가 깨지고, 임베딩 모델 입력 한도(8k 토큰)
 *    에는 한참 못 미치기 때문이다.
 */

/** 이 길이 이하는 조각내지 않는다. */
export const CHUNK_THRESHOLD = 1200;
/** 조각 하나의 목표 상한. 섹션 단위로 담다가 넘으면 다음 조각으로 넘긴다. */
export const CHUNK_TARGET = 1000;

const SECTION_SPLIT = /^(?=\[)/m;
const POLICY_NAME_RE = /^\[(?:정책명|서비스명|시설명|단지명|공고명)\]\s*(.+)$/m;

/** 본문 첫머리의 정책명 줄. 조각마다 머리에 다시 붙인다. */
function extractHeader(content: string): string | null {
  const m = content.match(POLICY_NAME_RE);
  return m ? m[0].trim() : null;
}

/**
 * 섹션 경계로 나눈 조각 배열. 자를 필요가 없으면 원문 한 개를 돌려준다.
 * 호출부는 길이와 무관하게 이 함수를 쓰면 된다.
 */
export function chunkPolicyContent(
  content: string,
  options: { threshold?: number; target?: number } = {},
): string[] {
  const threshold = options.threshold ?? CHUNK_THRESHOLD;
  const target = options.target ?? CHUNK_TARGET;
  const text = content.trim();
  if (text.length <= threshold) return [text];

  const sections = text
    .split(SECTION_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  // 섹션 마커가 없으면 쪼갤 경계가 없다 — 원문을 그대로 둔다.
  if (sections.length <= 1) return [text];

  const header = extractHeader(text);
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;

  const flush = () => {
    if (current.length === 0) return;
    const body = current.join('\n');
    // 첫 조각은 이미 정책명으로 시작하므로 중복해 붙이지 않는다.
    const needsHeader = header && !body.startsWith(header);
    chunks.push(needsHeader ? `${header}\n${body}` : body);
    current = [];
    length = 0;
  };

  for (const section of sections) {
    if (length > 0 && length + section.length > target) flush();
    current.push(section);
    length += section.length;
  }
  flush();

  return chunks.length > 0 ? chunks : [text];
}
