'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  Sparkles, Shield, Zap, ChevronRight, Star, Check,
  Bot, BarChart3, Globe, Bell, ArrowRight, Brain
} from 'lucide-react';

const FEATURES = [
  { icon: Brain, title: 'GPT-5 기반 AI 분석', desc: '최신 AI가 내 조건을 정밀 분석해 딱 맞는 복지 정책을 골라드립니다.' },
  { icon: Globe, title: '48,000+ 정책 데이터베이스', desc: '중앙부처·지자체·공공임대·복지시설까지 5개 공공 API 실시간 연동.' },
  { icon: Zap, title: '신청 링크 바로 제공', desc: '정책 안내와 함께 복지로·마이홈포털 신청 링크를 즉시 제공합니다.' },
  { icon: Shield, title: '개인정보 안전 보호', desc: 'AI 분석에 사용되는 데이터는 암호화되어 안전하게 관리됩니다.' },
  { icon: BarChart3, title: '그래프 RAG 기술', desc: 'Neo4j 그래프 DB + Qdrant 벡터 검색으로 관계 기반 정책 추천.' },
  { icon: Bell, title: '신규 정책 알림', desc: '매일 자동 업데이트, 새 모집공고나 혜택 변경 시 즉시 알림.' },
];

const STATS = [
  { value: '48,223', label: '적재된 정책·시설·공고', suffix: '건+' },
  { value: '5', label: '연동 공공 API', suffix: '개' },
  { value: '24', label: '데이터 자동 업데이트', suffix: '/7' },
  { value: '0', label: '이용 요금', suffix: '원' },
];

const STEPS = [
  { n: '01', title: '프로필 입력', desc: '나이, 거주지, 가구 형태, 소득 수준 등 기본 정보를 입력합니다.' },
  { n: '02', title: 'AI 맞춤 분석', desc: 'GPT-5 기반 AI가 수만 건의 정책 DB에서 나에게 맞는 것만 선별합니다.' },
  { n: '03', title: '신청까지 바로', desc: '정책 상세 설명과 함께 공식 신청 링크를 즉시 제공합니다.' },
];

const QUESTIONS = [
  '신혼부부 전세 지원금 받을 수 있나요?',
  '저소득층 의료비 지원 정책이 있나요?',
  '청년 월세 보조금 신청 방법 알려줘',
  '65세 이상 어르신 복지 혜택 뭐가 있어요?',
];

export default function LandingPage() {
  const [question, setQuestion] = useState('');
  const [qIdx, setQIdx] = useState(0);
  const [typed, setTyped] = useState('');

  // 타이핑 애니메이션
  useEffect(() => {
    const target = QUESTIONS[qIdx];
    if (typed.length < target.length) {
      const t = setTimeout(() => setTyped(target.slice(0, typed.length + 1)), 40);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setTyped('');
      setQIdx((i) => (i + 1) % QUESTIONS.length);
    }, 2000);
    return () => clearTimeout(t);
  }, [typed, qIdx]);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* ── Navbar ── */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-white/5 glass">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="gradient-text">WelfareAI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition">기능</a>
            <a href="#how" className="hover:text-white transition">이용방법</a>
            <a href="#stats" className="hover:text-white transition">데이터</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition px-4 py-2">
              로그인
            </Link>
            <Link href="/register" className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg transition font-medium">
              무료 시작하기
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="pt-32 pb-24 px-6 relative overflow-hidden">
        {/* 배경 글로우 */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 left-1/3 w-[300px] h-[300px] bg-violet-600/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-medium mb-8">
            <Sparkles size={12} />
            GPT-5 기반 복지 AI · 48,223건 정책 DB
          </div>

          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6">
            나에게 맞는<br />
            <span className="gradient-text">복지·지원금</span>을<br />
            AI가 찾아드립니다
          </h1>

          <p className="text-gray-400 text-xl leading-relaxed mb-10 max-w-2xl mx-auto">
            정부·지자체 수만 건의 정책 데이터베이스에서<br />
            내 조건에 딱 맞는 복지 혜택과 신청 방법을 즉시 안내합니다.
          </p>

          {/* 데모 입력창 */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative bg-zinc-900 border border-white/10 rounded-2xl p-1 shadow-2xl shadow-black/40">
              <div className="flex items-center gap-3 px-4 py-3">
                <Bot size={18} className="text-blue-400 shrink-0" />
                <input
                  value={question || typed}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder=""
                  className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-gray-600"
                />
                <Link
                  href={question ? `/register?q=${encodeURIComponent(question)}` : '/register'}
                  className="shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-xl transition font-medium flex items-center gap-1.5"
                >
                  무료로 묻기 <ArrowRight size={14} />
                </Link>
              </div>
              <div className="px-4 pb-3 flex items-center gap-2">
                {QUESTIONS.slice(0, 2).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuestion(q)}
                    className="text-xs text-gray-500 hover:text-gray-300 border border-white/5 hover:border-white/10 px-3 py-1 rounded-full transition"
                  >
                    {q.slice(0, 16)}…
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-1.5"><Check size={14} className="text-green-400" /> 무료 이용</span>
            <span className="flex items-center gap-1.5"><Check size={14} className="text-green-400" /> 회원가입 1분</span>
            <span className="flex items-center gap-1.5"><Check size={14} className="text-green-400" /> 신청 링크 즉시 제공</span>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section id="stats" className="py-16 px-6 border-y border-white/5">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-4xl font-bold gradient-text mb-1">{s.value}{s.suffix}</div>
              <div className="text-gray-500 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 데이터 출처 배지 ── */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-gray-600 text-xs uppercase tracking-widest mb-6">공식 공공 데이터 연동</p>
          <div className="flex flex-wrap justify-center gap-3">
            {['공공데이터포털', '복지로(bokjiro)', 'LH 마이홈', '국토교통부', '사회보장정보원'].map((s) => (
              <span key={s} className="px-4 py-2 bg-zinc-900 border border-white/5 rounded-full text-gray-400 text-sm">
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              왜 <span className="gradient-text">WelfareAI</span>인가요?
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              단순 검색이 아닙니다. 내 상황을 이해하는 AI 복지 컨설턴트입니다.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="glass rounded-2xl p-6 hover:border-white/10 transition group">
                <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition">
                  <Icon size={20} className="text-blue-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">3단계로 끝납니다</h2>
            <p className="text-gray-400">복잡한 복지 신청, 이제 AI가 도와드립니다.</p>
          </div>
          <div className="relative">
            <div className="hidden md:block absolute top-8 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
            <div className="grid md:grid-cols-3 gap-8">
              {STEPS.map((s) => (
                <div key={s.n} className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
                    <span className="text-white font-bold text-lg">{s.n}</span>
                  </div>
                  <h3 className="font-semibold text-white text-lg mb-2">{s.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="glass rounded-3xl p-12 border border-brand-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-violet-600/10 pointer-events-none" />
            <div className="relative">
              <Star className="w-8 h-8 text-yellow-400 mx-auto mb-4" />
              <h2 className="text-3xl font-bold mb-4">지금 바로 무료로 시작하세요</h2>
              <p className="text-gray-400 mb-8">
                내 조건에 맞는 복지 혜택, 1분 만에 확인하세요.<br />
                회원가입만 하면 바로 이용 가능합니다.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-8 py-4 rounded-xl text-base font-semibold transition shadow-lg shadow-blue-500/25"
              >
                무료로 시작하기 <ChevronRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Sparkles size={14} className="text-blue-400" />
            <span className="gradient-text font-semibold">WelfareAI</span>
            <span>© 2026 · 공공데이터 기반 복지 정책 안내 서비스</span>
          </div>
          <div className="flex gap-6 text-xs text-gray-600">
            <a href="#" className="hover:text-gray-400">이용약관</a>
            <a href="#" className="hover:text-gray-400">개인정보처리방침</a>
            <a href="#" className="hover:text-gray-400">문의</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
