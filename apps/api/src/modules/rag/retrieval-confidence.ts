/**
 * 검색 신뢰도 판정의 순수 로직.
 *
 * rag.graph의 assess_retrieval 게이트가 사용하며, 라이브 Qdrant 없이도
 * 골든셋으로 회귀를 잠글 수 있도록 결정 로직만 떼어냈다.
 *
 * 신호는 "점수"가 아니라 "엔티티 부재"다. 질문이 특정 정책명을 지목했는데,
 * 검색된 문서의 정책명(title) 또는 본문의 구조화 마커 "[정책명] X" 에 그게
 * 하나도 없으면 저신뢰로 본다. 본문에 우발적으로 언급된 경우(예: "기초연금과
 * 중복 불가")는 매칭하지 않는다.
 */
export interface RetrievedDoc {
  title?: string | null;
  content?: string | null;
}

export interface NamedProgramAssessment {
  lowConfidence: boolean;
  namedPrograms: string[];
  matched: string[];
  missing: string[];
}

function programInTitle(program: string, titles: string[]): boolean {
  return titles.some((title) => title.includes(program));
}

function programInContentMarker(program: string, contents: string[]): boolean {
  const marker = new RegExp(`\\[정책명\\]\\s*${program}`);
  return contents.some((content) => marker.test(content));
}

export function assessNamedProgramCoverage(
  namedPrograms: string[],
  docs: RetrievedDoc[],
): NamedProgramAssessment {
  if (namedPrograms.length === 0) {
    return { lowConfidence: false, namedPrograms, matched: [], missing: [] };
  }

  const titles = docs.map((doc) => doc.title ?? '').filter(Boolean);
  const contents = docs.map((doc) => doc.content ?? '').filter(Boolean);

  const matched = namedPrograms.filter(
    (program) =>
      programInTitle(program, titles) || programInContentMarker(program, contents),
  );
  const missing = namedPrograms.filter((program) => !matched.includes(program));

  // 지목된 정책 중 하나라도 검색 결과에 있으면 답변을 진행한다(부분 매치 허용).
  // 전부 부재일 때만 저신뢰로 보고 HITL 재질문으로 전환한다.
  return {
    lowConfidence: matched.length === 0,
    namedPrograms,
    matched,
    missing,
  };
}
