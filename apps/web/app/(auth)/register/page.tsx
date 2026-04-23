'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { api, persistAccessToken } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';
import { BrandMark } from '../../../components/brand-mark';

const SIDO_LIST = [
  { code: '11', name: '서울' }, { code: '26', name: '부산' }, { code: '27', name: '대구' },
  { code: '28', name: '인천' }, { code: '29', name: '광주' }, { code: '30', name: '대전' },
  { code: '31', name: '울산' }, { code: '36', name: '세종' }, { code: '41', name: '경기' },
  { code: '43', name: '충북' }, { code: '44', name: '충남' }, { code: '45', name: '전북' },
  { code: '46', name: '전남' }, { code: '47', name: '경북' }, { code: '48', name: '경남' },
  { code: '50', name: '제주' },
];

const step1Schema = z.object({
  name: z.string().min(2, '이름은 2자 이상이어야 합니다'),
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
});

const step2Schema = z.object({
  birthYear: z.string().min(1, '출생연도를 선택하세요'),
  birthMonth: z.string().min(1, '월을 선택하세요'),
  birthDay: z.string().min(1, '일을 선택하세요'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  sidoCode: z.string().min(1, '거주 지역을 선택하세요'),
  householdType: z.enum(['SINGLE', 'COUPLE', 'FAMILY', 'SINGLE_PARENT']),
  householdCount: z.coerce.number().min(1),
});

const step3Schema = z.object({
  occupationType: z.enum(['EMPLOYEE', 'FREELANCER', 'SELF_EMPLOYED', 'UNEMPLOYED', 'STUDENT']),
  incomeBracket: z.coerce.number().min(40),
  isHomeowner: z.boolean(),
  isDisabled: z.boolean(),
  isVeteran: z.boolean(),
  isSingleParent: z.boolean(),
  hasChildren: z.boolean(),
  childrenCount: z.coerce.number().min(0).optional(),
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;
type Step3 = z.infer<typeof step3Schema>;

const STEPS = ['기본 정보', '개인 정보', '추가 정보'];

const INCOME_OPTIONS = [
  { value: 40, label: '기초수급자 (40% 이하)' },
  { value: 50, label: '차상위계층 (50% 이하)' },
  { value: 60, label: '중위소득 60% 이하' },
  { value: 70, label: '중위소득 70% 이하' },
  { value: 80, label: '중위소득 80% 이하' },
  { value: 100, label: '중위소득 100% 이하' },
  { value: 120, label: '중위소득 120% 이하' },
  { value: 150, label: '중위소득 150% 이하' },
  { value: 200, label: '중위소득 150% 초과' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => CURRENT_YEAR - 14 - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const GENDER_OPTIONS: Array<{ v: Step2['gender']; l: string }> = [
  { v: 'MALE', l: '남성' },
  { v: 'FEMALE', l: '여성' },
  { v: 'OTHER', l: '기타' },
];

const HOUSEHOLD_OPTIONS: Array<{ v: Step2['householdType']; l: string }> = [
  { v: 'SINGLE', l: '1인 가구' },
  { v: 'COUPLE', l: '부부 가구' },
  { v: 'FAMILY', l: '가족 가구' },
  { v: 'SINGLE_PARENT', l: '한부모 가구' },
];

const CHECK_OPTIONS: Array<{ key: keyof Step3; label: string }> = [
  { key: 'isHomeowner', label: '주택 소유자 (본인 명의)' },
  { key: 'isDisabled', label: '장애인 등록' },
  { key: 'isVeteran', label: '국가보훈대상자' },
  { key: 'isSingleParent', label: '한부모가정' },
  { key: 'hasChildren', label: '자녀 있음 (만 18세 미만)' },
];

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useUserStore((s) => s.setAuth);
  const setProfile = useUserStore((s) => s.setProfile);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState('');
  const [formData, setFormData] = useState<Partial<Step1 & Step2 & Step3>>({});

  const form1 = useForm<Step1>({
    resolver: zodResolver(step1Schema),
    defaultValues: formData,
  });
  const form2 = useForm<Step2>({
    resolver: zodResolver(step2Schema),
    defaultValues: formData as Step2,
  });
  const form3 = useForm<Step3>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      occupationType: (formData as Step3).occupationType,
      incomeBracket: (formData as Step3).incomeBracket,
      isHomeowner: false,
      isDisabled: false,
      isVeteran: false,
      isSingleParent: false,
      hasChildren: false,
      childrenCount: 0,
      ...formData,
    },
  });

  const hasChildren = form3.watch('hasChildren');

  const onStep1 = (data: Step1) => {
    setFormData((p) => ({ ...p, ...data }));
    setStep(2);
  };

  const onStep2 = (data: Step2) => {
    setFormData((p) => ({ ...p, ...data }));
    setStep(3);
  };

  const onStep3 = async (data: Step3) => {
    const all = { ...formData, ...data } as Step1 & Step2 & Step3;
    setServerError('');
    const birthDate = `${all.birthYear}-${String(all.birthMonth).padStart(2, '0')}-${String(
      all.birthDay,
    ).padStart(2, '0')}`;
    const sigunguCode = `${all.sidoCode}000`;

    try {
      const res = await api<{
        accessToken: string;
        user: { id: string; name: string; role: string };
      }>('/auth/register', {
        method: 'POST',
        body: {
          name: all.name,
          email: all.email,
          password: all.password,
          birthDate,
          gender: all.gender,
          sidoCode: all.sidoCode,
          sigunguCode,
          householdType: all.householdType,
          householdCount: all.householdCount,
          occupationType: all.occupationType,
          incomeBracket: all.incomeBracket,
          isHomeowner: all.isHomeowner ?? false,
          isDisabled: all.isDisabled ?? false,
          isVeteran: all.isVeteran ?? false,
          isSingleParent: all.isSingleParent ?? false,
          hasChildren: all.hasChildren ?? false,
          childrenCount: all.childrenCount ?? 0,
        },
      });
      persistAccessToken(res.accessToken);
      setAuth(res.accessToken, res.user.id, res.user.name, res.user.role);
      setProfile({
        birthDate,
        gender: all.gender,
        sidoCode: all.sidoCode,
        sigunguCode,
        householdType: all.householdType,
        householdCount: all.householdCount,
        occupationType: all.occupationType,
        incomeBracket: all.incomeBracket,
        isHomeowner: all.isHomeowner ?? false,
        isDisabled: all.isDisabled ?? false,
        isVeteran: all.isVeteran ?? false,
        isSingleParent: all.isSingleParent ?? false,
        hasChildren: all.hasChildren ?? false,
        childrenCount: all.childrenCount ?? 0,
      });
      router.push('/chat');
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string } })?.data?.message;
      setServerError(msg ?? '회원가입 중 오류가 발생했습니다.');
    }
  };

  const stepHeadings = {
    1: { title: '기본 정보', desc: '로그인에 사용할 계정 정보를 입력해주세요.' },
    2: { title: '개인 정보', desc: '추천 정확도를 위해 기본 정보를 알려주세요.' },
    3: { title: '추가 정보', desc: '해당되는 상황을 선택하면 더 정밀한 추천이 가능합니다.' },
  } as const;

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
          <h2
            style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}
          >
            맞춤 추천을 위해
            <br />
            프로필을 함께 입력해주세요
          </h2>
          <p
            style={{
              marginTop: 16,
              fontSize: 14,
              lineHeight: 1.7,
              color: 'rgba(245,243,238,0.7)',
            }}
          >
            거주 지역, 가구 형태, 소득 수준을 저장해두면 실제로 신청할 수 있는 지원만
            선별해 보여드립니다.
          </p>

          <div
            style={{
              marginTop: 40,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {['3단계 · 약 2분 소요', '언제든지 수정 가능', '공식 출처 기반 추천'].map((t) => (
              <div
                key={t}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  color: 'rgba(245,243,238,0.8)',
                }}
              >
                <Check size={14} style={{ color: 'var(--accent)' }} />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="auth-form-panel-responsive"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
          overflow: 'auto',
        }}
      >
        <div className="auth-form-width-responsive" style={{ width: '100%', maxWidth: 420 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}
          >
            {STEPS.map((s, i) => {
              const n = (i + 1) as 1 | 2 | 3;
              const active = n === step;
              const done = n < step;
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: active ? 'var(--accent-soft)' : 'transparent',
                      color: active
                        ? 'var(--accent-text)'
                        : done
                          ? 'var(--text-primary)'
                          : 'var(--text-muted)',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        background: active
                          ? 'var(--accent)'
                          : done
                            ? 'var(--text-primary)'
                            : 'var(--border-strong)',
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {done ? <Check size={10} strokeWidth={3} /> : n}
                    </span>
                    {s}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 20, height: 1, background: 'var(--border)' }} />
                  )}
                </div>
              );
            })}
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
            {stepHeadings[step].title}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              marginTop: 6,
              marginBottom: 28,
            }}
          >
            {stepHeadings[step].desc}
          </p>

          {step === 1 && (
            <form
              onSubmit={form1.handleSubmit(onStep1)}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <label className="label">이름</label>
                <input {...form1.register('name')} className="input" placeholder="홍길동" />
                {form1.formState.errors.name && (
                  <p style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                    {form1.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <label className="label">이메일</label>
                <input
                  {...form1.register('email')}
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                />
                {form1.formState.errors.email && (
                  <p style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                    {form1.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <label className="label">비밀번호</label>
                <div style={{ position: 'relative' }}>
                  <input
                    {...form1.register('password')}
                    className="input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="8자 이상"
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
                {form1.formState.errors.password && (
                  <p style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                    {form1.formState.errors.password.message}
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="btn-primary"
                style={{ padding: '12px 16px', marginTop: 8 }}
              >
                다음 <ArrowRight size={14} />
              </button>
            </form>
          )}

          {step === 2 && (
            <form
              onSubmit={form2.handleSubmit(onStep2)}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <label className="label">생년월일</label>
                <div
                  className="auth-three-col-responsive"
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}
                >
                  <select {...form2.register('birthYear')} className="input">
                    <option value="">년도</option>
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                  <select {...form2.register('birthMonth')} className="input">
                    <option value="">월</option>
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}월</option>
                    ))}
                  </select>
                  <select {...form2.register('birthDay')} className="input">
                    <option value="">일</option>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>{d}일</option>
                    ))}
                  </select>
                </div>
                {(form2.formState.errors.birthYear ||
                  form2.formState.errors.birthMonth ||
                  form2.formState.errors.birthDay) && (
                  <p style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                    생년월일을 모두 선택하세요
                  </p>
                )}
              </div>

              <div>
                <label className="label">성별</label>
                <div
                  className="auth-three-col-responsive"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}
                >
                  {GENDER_OPTIONS.map(({ v, l }) => {
                    const active = form2.watch('gender') === v;
                    return (
                      <label
                        key={v}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          color: active ? 'var(--accent-text)' : 'var(--text-primary)',
                          fontSize: 14,
                          cursor: 'pointer',
                          fontWeight: active ? 500 : 400,
                          textAlign: 'center',
                        }}
                      >
                        <input
                          {...form2.register('gender')}
                          type="radio"
                          value={v}
                          style={{ display: 'none' }}
                        />
                        {l}
                      </label>
                    );
                  })}
                </div>
                {form2.formState.errors.gender && (
                  <p style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                    성별을 선택하세요
                  </p>
                )}
              </div>

              <div>
                <label className="label">거주 지역</label>
                <select {...form2.register('sidoCode')} className="input">
                  <option value="">지역 선택</option>
                  {SIDO_LIST.map(({ code, name }) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
                {form2.formState.errors.sidoCode && (
                  <p style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                    거주 지역을 선택하세요
                  </p>
                )}
              </div>

              <div>
                <label className="label">가구 형태</label>
                <div
                  className="auth-two-col-responsive"
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}
                >
                  {HOUSEHOLD_OPTIONS.map(({ v, l }) => {
                    const active = form2.watch('householdType') === v;
                    return (
                      <label
                        key={v}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          color: active ? 'var(--accent-text)' : 'var(--text-primary)',
                          fontSize: 14,
                          cursor: 'pointer',
                          fontWeight: active ? 500 : 400,
                          textAlign: 'left',
                        }}
                      >
                        <input
                          {...form2.register('householdType')}
                          type="radio"
                          value={v}
                          style={{ display: 'none' }}
                        />
                        {l}
                      </label>
                    );
                  })}
                </div>
                {form2.formState.errors.householdType && (
                  <p style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                    가구 형태를 선택하세요
                  </p>
                )}
              </div>

              <div>
                <label className="label">가구원 수</label>
                <select {...form2.register('householdCount')} className="input">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}인 가구</option>
                  ))}
                  <option value="7">7인 이상 가구</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn-secondary"
                  style={{ flex: 1, padding: '12px 16px' }}
                >
                  <ChevronLeft size={14} /> 이전
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1, padding: '12px 16px' }}
                >
                  다음 <ArrowRight size={14} />
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form
              onSubmit={form3.handleSubmit(onStep3)}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <label className="label">직업·고용 형태</label>
                <select {...form3.register('occupationType')} className="input">
                  <option value="EMPLOYEE">직장인 (근로자)</option>
                  <option value="FREELANCER">프리랜서</option>
                  <option value="SELF_EMPLOYED">자영업자</option>
                  <option value="UNEMPLOYED">무직·구직 중</option>
                  <option value="STUDENT">학생</option>
                </select>
              </div>

              <div>
                <label className="label">소득 수준 (기준 중위소득)</label>
                <select {...form3.register('incomeBracket')} className="input">
                  {INCOME_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">해당 사항을 모두 선택하세요</label>
                <div style={{ display: 'grid', gap: 6 }}>
                  {CHECK_OPTIONS.map(({ key, label }) => (
                    <label
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-surface)',
                        fontSize: 13,
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input
                        {...form3.register(key as keyof Step3)}
                        type="checkbox"
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {hasChildren && (
                <div>
                  <label className="label">자녀 수</label>
                  <select {...form3.register('childrenCount')} className="input">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}명</option>
                    ))}
                  </select>
                </div>
              )}

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

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn-secondary"
                  style={{ flex: 1, padding: '12px 16px' }}
                >
                  <ChevronLeft size={14} /> 이전
                </button>
                <button
                  type="submit"
                  disabled={form3.formState.isSubmitting}
                  className="btn-primary"
                  style={{ flex: 1, padding: '12px 16px' }}
                >
                  {form3.formState.isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> 가입 중...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> 가입 완료
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          <p
            style={{
              textAlign: 'center',
              fontSize: 14,
              color: 'var(--text-secondary)',
              marginTop: 24,
              marginBottom: 0,
            }}
          >
            이미 계정이 있으신가요?{' '}
            <Link
              href="/login"
              style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
            >
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
