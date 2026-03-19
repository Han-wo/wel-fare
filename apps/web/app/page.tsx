'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { BrandLockup } from '../components/brand-mark';

const SAMPLE_QUESTIONS = [
  '서울 청년이 지금 신청 가능한 월세 지원만 알려줘',
  '무주택 1인 가구가 바로 볼 수 있는 주거 지원 정리해줘',
  '부모님 근처 복지시설과 돌봄 지원 같이 찾아줘',
];

export default function LandingPage() {
  const [question, setQuestion] = useState('');

  return (
    <main className="min-h-screen overflow-x-hidden px-6 py-10 md:px-8 md:py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div className="reveal-up pt-2">
            <div className="relative mb-8 w-fit">
              <div className="pulse-glow absolute left-4 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(47,111,91,0.16),transparent_72%)]" />
              <div className="relative">
                <BrandLockup showCaption />
              </div>
            </div>

            <h1 className="display-text text-5xl font-semibold leading-[1.02] text-[var(--text-primary)] md:text-6xl">
              복지 정보를
              <br />
              가장 빠르게 찾는 방법
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)]">
              지금 필요한 지원을 질문하면 신청 가능한 제도와 공식 경로만 간단하게 정리해드립니다.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={question ? `/register?q=${encodeURIComponent(question)}` : '/register'}
                className="button-primary"
              >
                시작하기
                <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="button-secondary">
                로그인
              </Link>
            </div>
          </div>

          <div className="surface hero-grid reveal-up relative overflow-hidden rounded-[36px] p-6 md:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(47,111,91,0.11),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(190,141,67,0.12),transparent_30%)]" />
            <div className="pulse-glow absolute right-14 top-14 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(190,141,67,0.18),transparent_72%)]" />
            <div className="relative space-y-4">
              <div className="surface-soft floating-card rounded-[28px] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  질문 예시
                </p>
                <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                  "무주택 청년이 지금 신청 가능한 월세 지원만 알려줘"
                </p>
                <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
                  대상 조건, 마감 여부, 공식 신청 링크만 먼저 정리해서 보여줍니다.
                </p>
              </div>

              <div
                className="surface floating-card ml-auto w-[220px] rounded-[24px] p-4"
                style={{ animationDelay: '1.4s' }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  많이 찾는 질문
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                  청년 월세, 저소득 생활비, 공공임대
                </p>
              </div>

              <div
                className="surface-soft soft-float-delayed w-[210px] rounded-[22px] p-4"
                style={{ marginLeft: '2rem' }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  추천 흐름
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                  질문 입력 → 조건 확인 → 신청 링크 정리
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="surface reveal-up rounded-[36px] p-5 md:p-6" style={{ animationDelay: '0.08s' }}>
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              바로 질문해보세요
            </p>
            <div className="mt-4 rounded-[28px] border border-[var(--panel-border)] bg-white/80 px-4 py-4 shadow-[0_14px_34px_rgba(20,31,45,0.05)] md:px-5">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                placeholder="예: 경기도 청년이 지금 신청 가능한 주거 지원과 공식 신청 링크만 알려줘"
                className="w-full resize-none bg-transparent text-base leading-8 text-[var(--text-primary)] focus-visible:outline-none"
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-[var(--text-muted)]">질문 한 번으로 바로 시작할 수 있습니다.</div>
                <Link
                  href={question ? `/register?q=${encodeURIComponent(question)}` : '/register'}
                  className="button-primary whitespace-nowrap"
                >
                  이 질문으로 시작
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {SAMPLE_QUESTIONS.map((item) => (
              <button key={item} onClick={() => setQuestion(item)} className="badge-soft">
                {item}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
