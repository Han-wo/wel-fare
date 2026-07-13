'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, FileCheck, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { BrandMark } from '../components/brand-mark';

const SAMPLE_QUESTIONS = [
  '서울 청년이 지금 신청 가능한 월세 지원만 알려줘',
  '무주택 1인 가구가 바로 볼 수 있는 주거 지원 정리해줘',
  '부모님 근처 복지시설과 돌봄 지원 같이 찾아줘',
];

const OFFICIAL_SOURCES = ['정부24', '복지로', '지자체 공식 사이트'];

const HOW_STEPS = [
  {
    title: '질문하기',
    body: '지금 상황과 필요한 지원을 평소 말하듯 질문하세요. 복잡한 검색 조건은 필요 없습니다.',
  },
  {
    title: '조건 확인',
    body: '거주 지역, 가구 형태, 소득 수준을 기준으로 실제 신청 가능한 제도만 추려서 보여드립니다.',
  },
  {
    title: '바로 신청',
    body: '대상 조건, 마감 일정, 공식 신청 링크를 한 번에 확인하고 바로 신청할 수 있습니다.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [question, setQuestion] = useState(
    '경기도 청년이 지금 신청 가능한 주거 지원과 공식 신청 링크만 알려줘',
  );

  const go = () => {
    const q = question.trim();
    router.push(q ? `/register?q=${encodeURIComponent(q)}` : '/register');
  };

  return (
    <div style={{ background: 'var(--bg-canvas)', minHeight: '100dvh' }}>
      <header
        className="landing-header-responsive"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 48px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(245, 243, 238, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div className="brand-lockup">
            <BrandMark />
            welFareAI
          </div>
        </Link>
        <nav className="landing-nav-responsive" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <a className="btn-ghost" href="#features">
            소개
          </a>
          <a className="btn-ghost" href="#how">
            사용 방법
          </a>
          <Link href="/login" className="btn-ghost">
            로그인
          </Link>
          <Link href="/register" className="btn-primary" style={{ marginLeft: 8 }}>
            시작하기
          </Link>
        </nav>
      </header>

      <main
        className="landing-main-responsive"
        style={{ padding: '96px 48px 0', maxWidth: 1120, margin: '0 auto' }}
      >
        <div style={{ maxWidth: 720 }}>
          <div
            className="reveal"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              background: 'var(--accent-soft)',
              color: 'var(--accent-text)',
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 28,
            }}
          >
            복지 정보 AI 컨시어지
          </div>

          <h1
            className="landing-hero-title reveal reveal-d1"
            style={{
              fontSize: 64,
              lineHeight: 1.05,
              letterSpacing: '-0.035em',
              fontWeight: 600,
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            복지 정보를
            <br />
            <span style={{ color: 'var(--accent)' }}>가장 빠르게</span> 찾는 방법
          </h1>

          <p
            className="reveal reveal-d2"
            style={{
              fontSize: 18,
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              marginTop: 24,
              maxWidth: 560,
              letterSpacing: '-0.01em',
            }}
          >
            지금 필요한 지원을 질문하면, 내 조건에 맞는 제도와 공식 신청 경로만 간단하게
            정리해드립니다.
          </p>
        </div>

        <div
          className="reveal reveal-d3"
          style={{
            marginTop: 40,
            maxWidth: 720,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 16,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                go();
              }
            }}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: 'var(--font)',
              fontSize: 16,
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              background: 'transparent',
              minHeight: 72,
              padding: '8px 4px',
            }}
            placeholder="예) 서울 청년이 신청 가능한 월세 지원과 공식 신청 링크만 알려줘"
          />
          <div
            className="landing-panel-footer-responsive"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}
            >
              <Sparkles size={14} />
              <span>AI가 공식 출처만 참고합니다</span>
            </div>
            <button className="btn-primary" onClick={go}>
              질문 보내기
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="reveal reveal-d4" style={{ marginTop: 20, maxWidth: 720 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--text-muted)',
              marginBottom: 10,
              letterSpacing: '0.04em',
            }}
          >
            예시 질문
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SAMPLE_QUESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => setQuestion(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <section id="features" style={{ marginTop: 112 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: '0 0 24px',
              color: 'var(--text-primary)',
            }}
          >
            이런 기준으로 안내합니다
          </h2>
          <div
            className="landing-features-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 16,
            }}
          >
            <div
              className="landing-feature-wide"
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                padding: '28px 24px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--accent-soft)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: 'var(--bg-surface)',
                  color: 'var(--accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    margin: 0,
                    letterSpacing: '-0.01em',
                    color: 'var(--accent-text)',
                  }}
                >
                  공식 출처만 안내합니다
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                    marginTop: 6,
                    marginBottom: 0,
                  }}
                >
                  출처가 확인되지 않은 제도는 답변에서 제외합니다.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {OFFICIAL_SOURCES.map((src) => (
                  <span
                    key={src}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {src}
                  </span>
                ))}
              </div>
            </div>

            <div
              style={{
                padding: 24,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <UserCheck size={16} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
                내 조건 기준
              </h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  marginTop: 8,
                  marginBottom: 0,
                }}
              >
                거주 지역, 가구 형태, 소득 수준 등을 반영해 실제 받을 수 있는 지원만
                필터링합니다.
              </p>
            </div>

            <div
              style={{
                padding: 24,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <FileCheck size={16} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
                신청 경로까지
              </h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  marginTop: 8,
                  marginBottom: 0,
                }}
              >
                대상 조건, 마감 여부, 공식 신청 링크를 한 번에 정리해 드립니다.
              </p>
            </div>
          </div>
        </section>

        <section id="how" style={{ marginTop: 112, paddingBottom: 96 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              color: 'var(--text-primary)',
            }}
          >
            질문에서 신청까지, 세 단계
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              margin: '0 0 12px',
              maxWidth: 560,
            }}
          >
            회원가입 시 입력한 조건은 모든 답변에 자동으로 반영됩니다.
          </p>
          <div>
            {HOW_STEPS.map((step) => (
              <div
                key={step.title}
                className="landing-how-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '220px 1fr',
                  gap: 24,
                  padding: '28px 0',
                  borderTop: '1px solid var(--border)',
                  alignItems: 'baseline',
                }}
              >
                <h3
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    margin: 0,
                    color: 'var(--text-primary)',
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: 'var(--text-secondary)',
                    margin: 0,
                    maxWidth: 560,
                  }}
                >
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
        <div
          className="landing-footer-inner"
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            padding: '32px 48px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 24,
          }}
        >
          <div style={{ maxWidth: 480 }}>
            <div className="brand-lockup">
              <BrandMark />
              welFareAI
            </div>
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--text-muted)',
                marginTop: 12,
                marginBottom: 0,
              }}
            >
              welFareAI는 정부24, 복지로, 지자체 공식 사이트에 공개된 정보를 기반으로
              안내합니다. 최종 신청 조건과 일정은 각 기관의 공고를 확인하세요.
            </p>
          </div>
          <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <a className="btn-ghost" href="#features">
              소개
            </a>
            <a className="btn-ghost" href="#how">
              사용 방법
            </a>
            <Link href="/login" className="btn-ghost">
              로그인
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
