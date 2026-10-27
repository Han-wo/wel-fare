import { ImageResponse } from 'next/og';
import { BRAND, BrandMark } from '@/lib/brand';

// PWA 매니페스트가 참조하는 PNG 아이콘. 이미지 파일을 레포에 두는 대신
// 코드에서 그려, 브랜드 색이 바뀌면 아이콘도 따라 바뀌게 한다.
export const runtime = 'edge';

const ALLOWED = new Set([192, 512]);

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const size = Number(raw.replace('.png', ''));
  if (!ALLOWED.has(size)) return new Response('Not found', { status: 404 });

  // maskable 대응: 안드로이드가 아이콘을 원형 등으로 잘라내므로 20% 안전 여백을 둔다.
  const inset = Math.round(size * 0.1);
  const markSize = size - inset * 2;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: size,
          height: size,
          background: BRAND.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BrandMark size={markSize} radius={Math.round(markSize * 0.22)} />
      </div>
    ),
    { width: size, height: size },
  );
}
