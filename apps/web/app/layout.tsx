import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@xyflow/react/dist/style.css';

export const metadata: Metadata = {
  title: 'WelfareAI | 내 조건에 맞는 복지와 지원금 찾기',
  description:
    '복지, 주거, 청년정책, 공공임대, 시설 정보를 한곳에서 찾는 AI 복지 컨시어지 서비스',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f5f3ee',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" style={{ colorScheme: 'light' }}>
      <head>
        <meta name="theme-color" content="#f5f3ee" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
