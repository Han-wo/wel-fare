import type { CSSProperties } from 'react';

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
      style={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? 12 : 6,
        fontSize: size >= 40 ? Math.round(size * 0.58) : 16,
        ...style,
      }}
    >
      W
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
