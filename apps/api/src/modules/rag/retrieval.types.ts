export interface RetrievalItem {
  id: string;
  title: string;
  content: string;
  source: string;
  kind: string;
  score?: number | null;
  metadata: Record<string, unknown>;
}

export interface RetrievalResult {
  source: string;
  query: string;
  summary: string;
  items: RetrievalItem[];
  graphSummary?: string | null;
}

export interface EligibilityRetrievalResult extends RetrievalResult {
  profileSummary?: string | null;
}

export function retrievalResultToPromptBlock(
  result: RetrievalResult,
  options?: { heading?: string; emptyLabel?: string },
) {
  const heading = options?.heading ?? '검색 결과';
  const emptyLabel = options?.emptyLabel ?? '관련 자료를 찾지 못했습니다.';

  return [
    `## ${heading}`,
    result.items.length > 0
      ? result.items
          .map(
            (item, index) =>
              `### 자료 ${index + 1}\n[제목] ${item.title}\n[출처] ${item.source}\n${item.content}`,
          )
          .join('\n\n---\n\n')
      : emptyLabel,
    result.graphSummary ? `\n## 그래프 인사이트\n${result.graphSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function combineRetrievalPromptBlocks(
  sections: Array<{ title: string; result: RetrievalResult }>,
) {
  return sections
    .map(({ title, result }) => retrievalResultToPromptBlock(result, { heading: title }))
    .join('\n\n');
}

export function toStructuredToolPayload(result: RetrievalResult | EligibilityRetrievalResult) {
  return {
    source: result.source,
    query: result.query,
    summary: result.summary,
    profileSummary: 'profileSummary' in result ? result.profileSummary ?? null : null,
    graphSummary: result.graphSummary ?? null,
    items: result.items.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      kind: item.kind,
      score: item.score ?? null,
      content: item.content,
      metadata: item.metadata,
    })),
  };
}
