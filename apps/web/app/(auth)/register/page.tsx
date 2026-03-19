'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';
import { Eye, EyeOff, Loader2, ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';

/* ─── 시도 목록 ─── */
const SIDO_LIST = [
  { code: '11', name: '서울' }, { code: '26', name: '부산' }, { code: '27', name: '대구' },
  { code: '28', name: '인천' }, { code: '29', name: '광주' }, { code: '30', name: '대전' },
  { code: '31', name: '울산' }, { code: '36', name: '세종' }, { code: '41', name: '경기' },
  { code: '43', name: '충북' }, { code: '44', name: '충남' }, { code: '45', name: '전북' },
  { code: '46', name: '전남' }, { code: '47', name: '경북' }, { code: '48', name: '경남' },
  { code: '50', name: '제주' },
];

/* ─── Zod 스키마 ─── */
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

/* ─── 정적 날짜 데이터 (모듈 레벨에서 1회 생성) ─── */
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => CURRENT_YEAR - 14 - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const inputCls =
  'field-shell w-full rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(47,111,91,0.18)]';
const selectCls = `${inputCls} appearance-none`;
const labelCls =
  'mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]';

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useUserStore((s) => s.setAuth);
  const setProfile = useUserStore((s) => s.setProfile);
  const [step, setStep] = useState(1);
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState('');
  const [formData, setFormData] = useState<Partial<Step1 & Step2 & Step3>>({});

  /* ─── Step 1 폼 ─── */
  const form1 = useForm<Step1>({ resolver: zodResolver(step1Schema), defaultValues: formData });
  const form2 = useForm<Step2>({ resolver: zodResolver(step2Schema), defaultValues: formData as Step2 });
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
    const birthDate = `${all.birthYear}-${String(all.birthMonth).padStart(2, '0')}-${String(all.birthDay).padStart(2, '0')}`;
    const sigunguCode = `${all.sidoCode}000`;

    try {
      const res = await api<{ accessToken: string; refreshToken: string; user: { id: string; name: string; role: string } }>(
        '/auth/register',
        {
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
        },
      );
      localStorage.setItem('accessToken', res.accessToken);
      localStorage.setItem('refreshToken', res.refreshToken);
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

  return (
    <div className="w-full max-w-lg">
      <div className="surface rounded-[34px] p-7 md:p-8">
        <div className="mb-6">
          <span className="section-kicker">Create Account</span>
          <h2 className="display-text mt-5 text-3xl font-semibold text-[var(--text-primary)]">회원가입</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            프로필을 함께 입력하면 맞춤 복지 혜택과 최근 대화 추천 정밀도가 올라갑니다.
          </p>
        </div>

        <div className="mb-8 flex items-center justify-center gap-0">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={n} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      done
                        ? 'bg-[var(--brand)] text-[#f9f6ef]'
                        : active
                          ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                          : 'border border-[var(--panel-border)] bg-white/60 text-[var(--text-muted)]'
                    }`}
                  >
                    {done ? <Check size={14} /> : n}
                  </div>
                  <span className={`mt-2 text-xs ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mb-5 mx-2 h-px w-14 ${
                      done ? 'bg-[rgba(47,111,91,0.34)]' : 'bg-[var(--panel-border)]'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="surface-soft rounded-[30px] p-6">
          {/* ──── STEP 1 ──── */}
          {step === 1 && (
            <form onSubmit={form1.handleSubmit(onStep1)} className="space-y-4">
              <div>
                <label className={labelCls}>이름</label>
                <input {...form1.register('name')} placeholder="홍길동" className={inputCls} />
                {form1.formState.errors.name && <p className="mt-1 text-xs text-rose-500">{form1.formState.errors.name.message}</p>}
              </div>
              <div>
                <label className={labelCls}>이메일</label>
                <input {...form1.register('email')} type="email" placeholder="you@example.com" className={inputCls} />
                {form1.formState.errors.email && <p className="mt-1 text-xs text-rose-500">{form1.formState.errors.email.message}</p>}
              </div>
              <div>
                <label className={labelCls}>비밀번호</label>
                <div className="relative">
                  <input
                    {...form1.register('password')}
                    type={showPw ? 'text' : 'password'}
                    placeholder="8자 이상"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
                    className="absolute right-3 top-3 rounded-full p-1.5 text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(47,111,91,0.18)]"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form1.formState.errors.password && <p className="mt-1 text-xs text-rose-500">{form1.formState.errors.password.message}</p>}
              </div>
              <button type="submit" className="button-primary flex w-full items-center justify-center gap-2 mt-2">
                다음 <ChevronRight size={16} />
              </button>
            </form>
          )}

          {/* ──── STEP 2 ──── */}
          {step === 2 && (
            <form onSubmit={form2.handleSubmit(onStep2)} className="space-y-4">
              <div>
                <label className={labelCls}>생년월일</label>
                <div className="grid grid-cols-3 gap-2">
                  <select {...form2.register('birthYear')} className={selectCls}>
                    <option value="">년도</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
                  </select>
                  <select {...form2.register('birthMonth')} className={selectCls}>
                    <option value="">월</option>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
                  </select>
                  <select {...form2.register('birthDay')} className={selectCls}>
                    <option value="">일</option>
                    {DAYS.map((d) => <option key={d} value={d}>{d}일</option>)}
                  </select>
                </div>
                {(form2.formState.errors.birthYear || form2.formState.errors.birthMonth || form2.formState.errors.birthDay) && (
                  <p className="mt-1 text-xs text-rose-500">생년월일을 모두 선택하세요</p>
                )}
              </div>

              <div>
                <label className={labelCls}>성별</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ v: 'MALE', l: '남성' }, { v: 'FEMALE', l: '여성' }, { v: 'OTHER', l: '기타' }].map(({ v, l }) => (
                    <label
                      key={v}
                      className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm transition ${
                        form2.watch('gender') === v
                          ? 'border-[rgba(47,111,91,0.18)] bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                          : 'border-[var(--panel-border)] bg-white/60 text-[var(--text-secondary)] hover:bg-white/90'
                      }`}
                    >
                      <input {...form2.register('gender')} type="radio" value={v} className="hidden" />
                      {l}
                    </label>
                  ))}
                </div>
                {form2.formState.errors.gender && <p className="mt-1 text-xs text-rose-500">성별을 선택하세요</p>}
              </div>

              <div>
                <label className={labelCls}>거주 지역 (시·도)</label>
                <select {...form2.register('sidoCode')} className={selectCls}>
                  <option value="">지역 선택</option>
                  {SIDO_LIST.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
                </select>
                {form2.formState.errors.sidoCode && <p className="mt-1 text-xs text-rose-500">거주 지역을 선택하세요</p>}
              </div>

              <div>
                <label className={labelCls}>가구 형태</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'SINGLE', l: '1인 가구' },
                    { v: 'COUPLE', l: '부부 가구' },
                    { v: 'FAMILY', l: '가족 가구' },
                    { v: 'SINGLE_PARENT', l: '한부모 가구' },
                  ].map(({ v, l }) => (
                    <label
                      key={v}
                      className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm transition ${
                        form2.watch('householdType') === v
                          ? 'border-[rgba(47,111,91,0.18)] bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                          : 'border-[var(--panel-border)] bg-white/60 text-[var(--text-secondary)] hover:bg-white/90'
                      }`}
                    >
                      <input {...form2.register('householdType')} type="radio" value={v} className="hidden" />
                      {l}
                    </label>
                  ))}
                </div>
                {form2.formState.errors.householdType && <p className="mt-1 text-xs text-rose-500">가구 형태를 선택하세요</p>}
              </div>

              <div>
                <label className={labelCls}>가구원 수</label>
                <select {...form2.register('householdCount')} className={selectCls}>
                  {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n}인 가구</option>)}
                  <option value="7">7인 이상 가구</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)} className="button-secondary flex-1 justify-center">
                  <ChevronLeft size={16} /> 이전
                </button>
                <button type="submit" className="button-primary flex-1 justify-center">
                  다음 <ChevronRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* ──── STEP 3 ──── */}
          {step === 3 && (
            <form onSubmit={form3.handleSubmit(onStep3)} className="space-y-4">
              <div>
                <label className={labelCls}>직업·고용 형태</label>
                <select {...form3.register('occupationType')} className={selectCls}>
                  <option value="EMPLOYEE">직장인 (근로자)</option>
                  <option value="FREELANCER">프리랜서</option>
                  <option value="SELF_EMPLOYED">자영업자</option>
                  <option value="UNEMPLOYED">무직·구직 중</option>
                  <option value="STUDENT">학생</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>소득 수준 (기준 중위소득)</label>
                <select {...form3.register('incomeBracket')} className={selectCls}>
                  {INCOME_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>해당 사항을 모두 선택하세요</label>
                <div className="space-y-2">
                  {[
                    { key: 'isHomeowner' as const, label: '주택 소유자 (본인 명의)' },
                    { key: 'isDisabled' as const, label: '장애인 등록' },
                    { key: 'isVeteran' as const, label: '국가보훈대상자' },
                    { key: 'isSingleParent' as const, label: '한부모가정' },
                    { key: 'hasChildren' as const, label: '자녀 있음 (만 18세 미만)' },
                  ].map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--panel-border)] bg-white/60 px-4 py-3 text-sm text-[var(--text-secondary)] transition hover:bg-white/90 hover:text-[var(--text-primary)]"
                    >
                      <input
                        {...form3.register(key)}
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {hasChildren && (
                <div>
                  <label className={labelCls}>자녀 수</label>
                  <select {...form3.register('childrenCount')} className={selectCls}>
                    {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}명</option>)}
                  </select>
                </div>
              )}

              {serverError && (
                <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{serverError}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(2)} className="button-secondary flex-1 justify-center">
                  <ChevronLeft size={16} /> 이전
                </button>
                <button
                  type="submit"
                  disabled={form3.formState.isSubmitting}
                  className="button-primary flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {form3.formState.isSubmitting ? (
                    <><Loader2 size={16} className="animate-spin" /> 가입 중...</>
                  ) : (
                    <><Sparkles size={16} /> 가입 완료</>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <p className="text-center text-sm text-[var(--text-secondary)] mt-5">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="font-semibold text-[var(--brand)] transition hover:text-[var(--brand-strong)]">로그인</Link>
      </p>
    </div>
  );
}
