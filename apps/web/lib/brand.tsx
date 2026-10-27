/**
 * 브랜드 마크 — ImageResponse(next/og)용 JSX.
 *
 * public/logo-mark.svg와 같은 도형을 그린다. 두 벌로 나뉘는 이유는
 * ImageResponse가 Satori 기반이라 외부 SVG 파일을 불러올 수 없고
 * 인라인 엘리먼트만 받기 때문이다. 모양을 바꾸면 양쪽을 같이 고쳐야 한다.
 */
export const BRAND = {
  /** 버튼·마크 바탕. blue-500은 흰 글자 대비가 3.1이라 쓰지 않는다. */
  accent: '#0d47a1',
  soft: '#e3f2fd',
  bright: '#2196f3',
  canvas: '#f2f8fe',
  ink: '#213858',
} as const;

/**
 * 라운드 스퀘어 + 말풍선 W. size는 px.
 * public/logo-mark.svg와 같은 도형이다 — ImageResponse(Satori)는 외부 SVG를
 * 불러올 수 없어 인라인으로 다시 그린다. 모양을 바꾸면 양쪽을 같이 고쳐야 한다.
 */
export function BrandMark({ size, radius }: { size: number; radius: number }) {
  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        borderRadius: radius,
        background: BRAND.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 64 64">
        <path d="M32 12 C45.3 12 54 19.9 54 30.5 C54 41.1 45.3 49 32 49 C29.6 49 27.3 48.7 25.2 48.2 L14 53 L17.6 43.6 C12.5 40.2 10 35.6 10 30.5 C10 19.9 18.7 12 32 12 Z" fill="#ffffff" />
        <path
          d="M21 25 L27 37 L32 29 L37 37 L43 25"
          fill="none"
          stroke={BRAND.accent}
          strokeWidth={4.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
