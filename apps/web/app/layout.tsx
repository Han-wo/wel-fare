import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaProvider } from '@/components/pwa-provider';
import '@xyflow/react/dist/style.css';

export const metadata: Metadata = {
  title: 'WelfareAI | 내 조건에 맞는 복지와 지원금 찾기',
  description:
    '복지, 주거, 청년정책, 공공임대, 시설 정보를 한곳에서 찾는 AI 복지 컨시어지 서비스',
  applicationName: 'WelfareAI',
  // iOS는 매니페스트의 display:standalone을 읽지 않아 별도 메타가 필요하다.
  appleWebApp: { capable: true, title: 'WelfareAI', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f2f8fe',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" style={{ colorScheme: 'light' }}>
      <head>
        <meta name="theme-color" content="#f2f8fe" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased">
        {children}
        <PwaProvider />
      </body>
    </html>
  );
}
