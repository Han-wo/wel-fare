/**
 * 한국어 BM25형 sparse 벡터 인코더.
 *
 * Qdrant 하이브리드 검색(text_sparse)의 색인·질의 양쪽에서 같은 인코딩을 쓴다.
 * 시드(적재)와 VectorRetrievalService(질의)가 모두 이 파일을 import하므로
 * 토크나이즈 규칙을 바꾸면 백필(scripts의 sparse 백필)도 다시 돌려야 한다.
 *
 * 설계:
 *  - 토큰: 공백/구두점 분리 단어 + 한글 단어의 문자 bigram.
 *    형태소 분석기 없이 조사 편차("청년도약계좌를" vs "청년도약계좌")를
 *    bigram 중첩으로 흡수한다. 흔한 bigram은 서버측 IDF(modifier: idf)가 감쇠.
 *  - 인덱스: FNV-1a 32bit 해시 → u32. 충돌은 IDF 가중으로 실질 영향 미미.
 *  - 값: TF 포화(tf / (tf + K1)). 문서 길이 정규화는 생략(문서가 짧고 균질).
 */

export const SPARSE_VECTOR_NAME = 'text_sparse';

const K1 = 1.2;

// 한글·영숫자만 남기고 나머지는 공백으로.
const NON_TOKEN_RE = /[^0-9a-z가-힣]+/g;
const HANGUL_RE = /[가-힣]/;

export interface SparseVector {
  indices: number[];
  values: number[];
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function tokenizeKorean(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(NON_TOKEN_RE, ' ')
    .split(' ')
    .filter((word) => word.length >= 2);

  const tokens: string[] = [];
  for (const word of words) {
    tokens.push(word);
    // 한글 3자 이상 단어만 bigram 확장: 2자 단어는 자기 자신이 이미 bigram이고,
    // 영숫자(모델명·법령번호 등)는 조사 문제가 없어 원형 매치로 충분하다.
    if (word.length >= 3 && HANGUL_RE.test(word)) {
      for (let i = 0; i < word.length - 1; i++) {
        tokens.push(word.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

/** 문서/질의 텍스트를 Qdrant sparse 벡터로 인코딩한다. 토큰이 없으면 null. */
export function encodeSparseVector(text: string): SparseVector | null {
  const counts = new Map<number, number>();
  for (const token of tokenizeKorean(text)) {
    const index = fnv1a32(token);
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  const indices: number[] = [];
  const values: number[] = [];
  for (const [index, tf] of counts) {
    indices.push(index);
    values.push(tf / (tf + K1));
  }
  return { indices, values };
}

/**
 * 시드 upsert용: 기존 unnamed dense와 sparse를 함께 싣는 vector 필드를 만든다.
 * sparse 인코딩이 비면 dense만 실은 형태를 돌려준다(dense-only 포인트도 유효).
 */
export function buildQdrantVectors(
  dense: number[],
  sparseSourceText: string,
): Record<string, number[] | SparseVector> {
  const sparse = encodeSparseVector(sparseSourceText);
  return sparse ? { '': dense, [SPARSE_VECTOR_NAME]: sparse } : { '': dense };
}
