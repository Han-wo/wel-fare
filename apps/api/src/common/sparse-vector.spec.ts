import { describe, expect, it } from '@jest/globals';
import {
  buildQdrantVectors,
  encodeSparseVector,
  tokenizeKorean,
} from './sparse-vector';

describe('tokenizeKorean', () => {
  it('단어와 한글 bigram을 함께 생성한다', () => {
    const tokens = tokenizeKorean('청년도약계좌 신청');
    expect(tokens).toContain('청년도약계좌');
    expect(tokens).toContain('청년');
    expect(tokens).toContain('도약');
    expect(tokens).toContain('신청');
  });

  it('조사가 붙어도 bigram이 겹친다', () => {
    const doc = new Set(tokenizeKorean('청년도약계좌를 안내합니다'));
    const query = tokenizeKorean('청년도약계좌');
    const overlap = query.filter((token) => doc.has(token));
    expect(overlap.length).toBeGreaterThanOrEqual(query.length - 1);
  });

  it('구두점·영문 대소문자를 정규화한다', () => {
    expect(tokenizeKorean('LH 임대주택! (2024)')).toEqual(
      expect.arrayContaining(['lh', '임대주택', '2024']),
    );
  });

  it('1자 토큰은 버린다', () => {
    expect(tokenizeKorean('a 집 b')).toEqual([]);
  });
});

describe('encodeSparseVector', () => {
  it('같은 텍스트는 같은 인코딩을 낸다 (결정적)', () => {
    const a = encodeSparseVector('행복주택 청약 일정');
    const b = encodeSparseVector('행복주택 청약 일정');
    expect(a).toEqual(b);
  });

  it('indices와 values 길이가 같고 값은 (0,1) 범위다', () => {
    const encoded = encodeSparseVector('주거급여 신청 방법 안내');
    expect(encoded).not.toBeNull();
    expect(encoded!.indices.length).toBe(encoded!.values.length);
    for (const value of encoded!.values) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
    for (const index of encoded!.indices) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('반복 토큰은 TF 포화로 값이 커지되 1을 넘지 않는다', () => {
    const once = encodeSparseVector('청약');
    const thrice = encodeSparseVector('청약 청약 청약');
    expect(thrice!.values[0]).toBeGreaterThan(once!.values[0]);
    expect(thrice!.values[0]).toBeLessThan(1);
  });

  it('토큰이 없으면 null', () => {
    expect(encodeSparseVector('!!! ...')).toBeNull();
  });
});

describe('buildQdrantVectors', () => {
  it('dense는 빈 이름, sparse는 text_sparse로 싣는다', () => {
    const vectors = buildQdrantVectors([0.1, 0.2], '청년월세 지원');
    expect(vectors['']).toEqual([0.1, 0.2]);
    expect(vectors.text_sparse).toMatchObject({
      indices: expect.any(Array),
      values: expect.any(Array),
    });
  });

  it('sparse 인코딩이 비면 dense만 싣는다', () => {
    const vectors = buildQdrantVectors([0.1, 0.2], '');
    expect(vectors).toEqual({ '': [0.1, 0.2] });
  });
});
