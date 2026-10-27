import type { CSSProperties } from 'react';

const BUBBLE_PATH =
  'M32 12 C45.3 12 54 19.9 54 30.5 C54 41.1 45.3 49 32 49 C29.6 49 27.3 48.7 25.2 48.2 L14 53 L17.6 43.6 C12.5 40.2 10 35.6 10 30.5 C10 19.9 18.7 12 32 12 Z';
const W_PATH = 'M21 25 L27 37 L32 29 L37 37 L43 25';

/**
 * 브랜드 마크 — 말풍선에 W를 음각.
 *
 * 글자(텍스트 W)가 아니라 SVG인 이유: 폰트 로딩 전 깜빡임이 없고,
 * 크기를 줄여도 획 두께가 비례해 유지된다.
 * 모양을 바꾸면 app/icon.svg · public/logo-mark.svg · lib/brand.tsx도 같이 고쳐야 한다.
 */
export function BrandMark({
  size = 28,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      className="brand-mark"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? 12 : 7,
        ...style,
      }}
    >
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 64 64">
        <path d={BUBBLE_PATH} fill="currentColor" />
        <path
          d={W_PATH}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={4.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function BrandLockup({ style }: { style?: CSSProperties }) {
  return (
    <div className="brand-lockup" style={style}>
      <BrandMark />
      welFareAI
    </div>
  );
}
