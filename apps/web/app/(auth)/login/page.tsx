'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';

const schema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
});

type FormData = z.infer<typeof schema>;

const inputCls =
  'field-shell w-full rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(47,111,91,0.18)]';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useUserStore((s) => s.setAuth);
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      const res = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; name: string; role: string };
      }>('/auth/login', {
        method: 'POST',
        body: data,
      });

      localStorage.setItem('accessToken', res.accessToken);
      localStorage.setItem('refreshToken', res.refreshToken);
      setAuth(res.accessToken, res.user.id, res.user.name, res.user.role);
      router.push(res.user.role === 'ADMIN' ? '/admin' : '/chat');
    } catch {
      setServerError('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-4">
        <Link
          href="/"
          className="badge-soft gap-2 px-3 py-2 text-sm hover:border-[rgba(47,111,91,0.2)]"
        >
          <ArrowLeft size={14} />
          랜딩으로 돌아가기
        </Link>
      </div>

      <div className="surface rounded-[34px] p-7 md:p-8">
        <div className="mb-8">
          <h1 className="display-text text-3xl font-semibold text-[var(--text-primary)]">로그인</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            계정으로 바로 들어가서 대화를 이어보세요.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              이메일
            </label>
            <input
              {...register('email')}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              className={inputCls}
            />
            {errors.email && <p className="mt-2 text-xs text-rose-500">{errors.email.message}</p>}
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              비밀번호
            </label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                className={`${inputCls} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPw((current) => !current)}
                aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
                className="absolute right-3 top-3 rounded-full p-1.5 text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(47,111,91,0.18)]"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="mt-2 text-xs text-rose-500">{errors.password.message}</p>}
          </div>

          {serverError && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="button-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                로그인 중...
              </>
            ) : (
              <>
                로그인
              </>
            )}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
        계정이 없으신가요?{' '}
        <Link href="/register" className="font-semibold text-[var(--brand)] transition hover:text-[var(--brand-strong)]">
          무료 회원가입
        </Link>
      </p>
    </div>
  );
}
