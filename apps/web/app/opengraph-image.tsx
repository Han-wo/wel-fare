import { ImageResponse } from 'next/og';
import { BRAND, BrandMark } from '@/lib/brand';

// 카카오톡·슬랙·검색결과에 뜨는 공유 카드. 이미지 파일 대신 코드로 그려
// 브랜드 색·문구가 바뀌면 함께 갱신되게 한다.
export const runtime = 'edge';
export const alt = 'WelfareAI — 내 조건에 맞는 복지와 지원금 찾기';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: BRAND.canvas,
          padding: 80,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <BrandMark size={72} radius={16} />
          <div style={{ fontSize: 34, fontWeight: 700, color: BRAND.ink }}>WelfareAI</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: BRAND.ink,
              lineHeight: 1.15,
              letterSpacing: -2,
            }}
          >
            복지 정보를
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: BRAND.accent,
              lineHeight: 1.15,
              letterSpacing: -2,
            }}
          >
            가장 빠르게 찾는 방법
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          {['공식 출처만', '내 조건 기준', '신청 경로까지'].map((t) => (
            <div
              key={t}
              style={{
                display: 'flex',
                background: BRAND.soft,
                color: BRAND.accent,
                fontSize: 26,
                fontWeight: 600,
                padding: '12px 24px',
                borderRadius: 999,
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
