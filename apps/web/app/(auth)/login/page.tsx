'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { api, persistAccessToken } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';
import { BrandMark } from '../../../components/brand-mark';

const schema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useUserStore((s) => s.setAuth);
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      const res = await api<{
        accessToken: string;
        user: { id: string; name: string; role: string };
      }>('/auth/login', { method: 'POST', body: data });
      persistAccessToken(res.accessToken);
      setAuth(res.accessToken, res.user.id, res.user.name, res.user.role);
      router.push(res.user.role === 'ADMIN' ? '/admin' : '/chat');
    } catch {
      setServerError('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  return (
    <div
      className="auth-shell-responsive"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
      }}
    >
      <div
        className="auth-side-responsive"
        style={{
          background: '#1a1915',
          color: '#f5f3ee',
          padding: 48,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', color: '#f5f3ee' }}>
          <div className="brand-lockup" style={{ color: '#f5f3ee' }}>
            <BrandMark />
            welFareAI
          </div>
        </Link>

        <div>
          <p
            style={{
              fontSize: 28,
              lineHeight: 1.35,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              margin: 0,
              color: '#f5f3ee',
            }}
          >
            &ldquo;복지 정보는 흩어져 있고, 신청 조건은 늘 복잡합니다. 질문 한 번에 필요한
            답만 받아보세요.&rdquo;
          </p>
          <p
            style={{ marginTop: 20, fontSize: 13, color: 'rgba(245,243,238,0.6)' }}
          >
            welFareAI · AI 복지 컨시어지
          </p>
        </div>
      </div>

      <div
        className="auth-form-panel-responsive"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
        }}
      >
        <div className="auth-form-width-responsive" style={{ width: '100%', maxWidth: 380 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
            다시 오신 것을 환영합니다
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              marginTop: 8,
              marginBottom: 32,
            }}
          >
            계정으로 로그인하여 대화를 이어가세요.
          </p>

          <form
            onSubmit={handleSubmit(onSubmit)}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div>
              <label className="label" htmlFor="login-email">
                이메일
              </label>
              <input
                id="login-email"
                {...register('email')}
                className="input"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
              />
              {errors.email && (
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <label className="label" htmlFor="login-pw" style={{ marginBottom: 0 }}>
                  비밀번호
                </label>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-pw"
                  {...register('password')}
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 6,
                    display: 'inline-flex',
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {serverError && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--danger-soft)',
                  color: 'var(--danger)',
                  fontSize: 13,
                  border: '1px solid rgba(181,75,58,0.18)',
                }}
              >
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
              style={{ padding: '12px 16px', marginTop: 4 }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> 로그인 중...
                </>
              ) : (
                '로그인'
              )}
            </button>
          </form>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              margin: '24px 0',
              color: 'var(--text-faint)',
              fontSize: 12,
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span>또는</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            계정이 없으신가요?{' '}
            <Link
              href="/register"
              style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
            >
              무료 회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
