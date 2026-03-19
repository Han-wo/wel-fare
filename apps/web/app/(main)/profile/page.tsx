'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle, Loader2, Save, User } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';

const SIDO_LIST = [
  { code: '11', name: '서울' }, { code: '26', name: '부산' }, { code: '27', name: '대구' },
  { code: '28', name: '인천' }, { code: '29', name: '광주' }, { code: '30', name: '대전' },
  { code: '31', name: '울산' }, { code: '36', name: '세종' }, { code: '41', name: '경기' },
  { code: '43', name: '충북' }, { code: '44', name: '충남' }, { code: '45', name: '전북' },
  { code: '46', name: '전남' }, { code: '47', name: '경북' }, { code: '48', name: '경남' },
  { code: '50', name: '제주' },
];

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

interface ProfileForm {
  birthDate: string;
  gender: string;
  sidoCode: string;
  householdType: string;
  householdCount: number;
  occupationType: string;
  incomeBracket: number;
  isHomeowner: boolean;
  isDisabled: boolean;
  isVeteran: boolean;
  isSingleParent: boolean;
  hasChildren: boolean;
  childrenCount: number;
}

const inputCls =
  'field-shell w-full rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(47,111,91,0.18)]';
const selectCls = `${inputCls} appearance-none`;
const labelCls =
  'mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]';

export default function ProfilePage() {
  const setProfile = useUserStore((s) => s.setProfile);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting },
  } = useForm<ProfileForm>();

  useEffect(() => {
    api<ProfileForm>('/profile')
      .then((data) => {
        reset(data);
        setProfile(data);
      })
      .catch(() => {});
  }, [reset, setProfile]);

  const hasChildren = watch('hasChildren');

  const onSubmit = async (data: ProfileForm) => {
    await api('/profile', { method: 'PUT', body: data });
    setProfile(data);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="surface hero-grid rounded-[32px] px-7 py-8 md:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <span className="section-kicker">Profile Settings</span>
              <h1 className="display-text mt-5 text-4xl font-semibold text-[var(--text-primary)]">
                맞춤 추천 기준이 되는
                <br />
                프로필을 정리하세요
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                나이, 지역, 가구, 소득, 특수 상황을 저장하면 복지 찾기 화면에서 더 정확한 복지와
                주거 지원을 선별할 수 있습니다.
              </p>
            </div>

            <div className="surface-soft rounded-[28px] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                  <User size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">추천 품질을 높이는 정보</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    지역, 주거 상태, 자녀 여부가 반영됩니다.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                <span className="badge-soft">지역별 제도 필터링</span>
                <span className="badge-soft">생애주기 기반 추천</span>
                <span className="badge-soft">가구 조건별 우선순위 정렬</span>
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Section title="기본 정보">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelCls}>생년월일</label>
                <input {...register('birthDate')} type="date" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>성별</label>
                <select {...register('gender')} className={selectCls}>
                  <option value="MALE">남성</option>
                  <option value="FEMALE">여성</option>
                  <option value="OTHER">기타</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="거주 및 가구 정보">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>거주 지역 (시·도)</label>
                <select {...register('sidoCode')} className={selectCls}>
                  {SIDO_LIST.map(({ code, name }) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelCls}>가구 형태</label>
                  <select {...register('householdType')} className={selectCls}>
                    <option value="SINGLE">1인 가구</option>
                    <option value="COUPLE">부부 가구</option>
                    <option value="FAMILY">가족 가구</option>
                    <option value="SINGLE_PARENT">한부모 가구</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>가구원 수</label>
                  <select {...register('householdCount', { valueAsNumber: true })} className={selectCls}>
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}인</option>)}
                    <option value={7}>7인 이상</option>
                  </select>
                </div>
              </div>
            </div>
          </Section>

          <Section title="직업 및 소득">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>직업·고용 형태</label>
                <select {...register('occupationType')} className={selectCls}>
                  <option value="EMPLOYEE">직장인 (근로자)</option>
                  <option value="FREELANCER">프리랜서</option>
                  <option value="SELF_EMPLOYED">자영업자</option>
                  <option value="UNEMPLOYED">무직·구직 중</option>
                  <option value="STUDENT">학생</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>소득 수준 (기준 중위소득)</label>
                <select {...register('incomeBracket', { valueAsNumber: true })} className={selectCls}>
                  {INCOME_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          <Section title="추가 정보">
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
                  <input {...register(key)} type="checkbox" className="h-4 w-4 accent-[var(--brand)]" />
                  <span>{label}</span>
                </label>
              ))}
              {hasChildren && (
                <div className="pt-3">
                  <label className={labelCls}>자녀 수</label>
                  <select {...register('childrenCount', { valueAsNumber: true })} className={selectCls}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}명</option>)}
                  </select>
                </div>
              )}
            </div>
          </Section>

          <button
            type="submit"
            disabled={isSubmitting}
            className="button-primary flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                저장 중...
              </>
            ) : saved ? (
              <>
                <CheckCircle size={16} />
                저장되었습니다
              </>
            ) : (
              <>
                <Save size={16} />
                저장하기
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface rounded-[28px] p-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </div>
  );
}
