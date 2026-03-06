import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'WelfareAI — 나에게 맞는 복지·지원금 찾기',
  description: '초개인화 AI 복지 컨설턴트. 나의 조건에 맞는 정부 지원금을 한번에 찾아드립니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
