import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-transparent to-violet-950/20 pointer-events-none" />
      <header className="relative z-10 px-8 py-5">
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-base">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="gradient-text">WelfareAI</span>
        </Link>
      </header>
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        {children}
      </main>
    </div>
  );
}
