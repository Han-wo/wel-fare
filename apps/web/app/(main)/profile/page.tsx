'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Check, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserStore } from '../../../store/user.store';

const SIDO_LIST = [
  { code: '11', name: '서울특별시' }, { code: '26', name: '부산광역시' },
  { code: '27', name: '대구광역시' }, { code: '28', name: '인천광역시' },
  { code: '29', name: '광주광역시' }, { code: '30', name: '대전광역시' },
  { code: '31', name: '울산광역시' }, { code: '36', name: '세종특별자치시' },
  { code: '41', name: '경기도' }, { code: '43', name: '충청북도' },
  { code: '44', name: '충청남도' }, { code: '45', name: '전라북도' },
  { code: '46', name: '전라남도' }, { code: '47', name: '경상북도' },
  { code: '48', name: '경상남도' }, { code: '50', name: '제주특별자치도' },
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

const CHECK_OPTIONS: Array<{ key: keyof ProfileForm; label: string }> = [
  { key: 'isHomeowner', label: '주택 소유자' },
  { key: 'isDisabled', label: '장애인 등록' },
  { key: 'isVeteran', label: '국가보훈대상자' },
  { key: 'isSingleParent', label: '한부모가정' },
  { key: 'hasChildren', label: '자녀 있음 (18세 미만)' },
];

export default function ProfilePage() {
  const setProfile = useUserStore((s) => s.setProfile);
  const userName = useUserStore((s) => s.userName);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<ProfileForm>();

  useEffect(() => {
    api<ProfileForm>('/profile')
      .then((data) => {
        reset(data);
        setProfile(data);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [reset, setProfile]);

  const hasChildren = watch('hasChildren');
  const checked = CHECK_OPTIONS.map(({ key }) => Boolean(watch(key as 'isHomeowner')));

  const onSubmit = async (data: ProfileForm) => {
    await api('/profile', { method: 'PUT', body: data });
    setProfile(data);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  const initial = (userName ?? '사').charAt(0);

  return (
    <>
      <header
        className="page-header-responsive"
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-canvas)',
        }}
      >
        <h2
          style={{
            fontSize: 14,
            fontWeight: 500,
            margin: 0,
            color: 'var(--text-secondary)',
          }}
        >
          프로필
        </h2>
      </header>

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--bg-canvas)',
        }}
      >
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="profile-form-responsive"
          style={{ maxWidth: 880, margin: '0 auto', padding: '32px 32px 64px' }}
        >
          <div
            className="profile-hero-responsive"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              paddingBottom: 24,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: '#c8d8d0',
                color: '#2d4a3a',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 24,
                letterSpacing: '-0.02em',
              }}
            >
              {initial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                {userName ?? '사용자'}
              </h1>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  margin: '4px 0 0',
                }}
              >
                맞춤 추천 기준이 되는 프로필을 정리하세요.
              </p>
            </div>
            {loaded && (
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'var(--success-soft)',
                  color: 'var(--success)',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Check size={12} />
                프로필 로드됨
              </div>
            )}
          </div>

          <FormSection title="기본 정보" desc="맞춤 추천의 기준이 되는 정보입니다.">
            <div
              className="two-col-grid-responsive"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
            >
              <div>
                <label className="label">생년월일</label>
                <input {...register('birthDate')} className="input" type="date" />
              </div>
              <div>
                <label className="label">성별</label>
                <select {...register('gender')} className="input">
                  <option value="MALE">남성</option>
                  <option value="FEMALE">여성</option>
                  <option value="OTHER">기타</option>
                </select>
              </div>
            </div>
          </FormSection>

          <FormSection title="거주 및 가구" desc="지역별 · 가구별 제도가 필터링됩니다.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="label">거주 지역</label>
                <select {...register('sidoCode')} className="input">
                  {SIDO_LIST.map(({ code, name }) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
              <div
                className="two-col-grid-responsive"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
              >
                <div>
                  <label className="label">가구 형태</label>
                  <select {...register('householdType')} className="input">
                    <option value="SINGLE">1인 가구</option>
                    <option value="COUPLE">부부 가구</option>
                    <option value="FAMILY">가족 가구</option>
                    <option value="SINGLE_PARENT">한부모 가구</option>
                  </select>
                </div>
                <div>
                  <label className="label">가구원 수</label>
                  <select
                    {...register('householdCount', { valueAsNumber: true })}
                    className="input"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n}인</option>
                    ))}
                    <option value={7}>7인 이상</option>
                  </select>
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection title="직업 및 소득" desc="소득 수준은 많은 복지 제도의 선정 기준입니다.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="label">직업·고용 형태</label>
                <select {...register('occupationType')} className="input">
                  <option value="EMPLOYEE">직장인 (근로자)</option>
                  <option value="FREELANCER">프리랜서</option>
                  <option value="SELF_EMPLOYED">자영업자</option>
                  <option value="UNEMPLOYED">무직·구직 중</option>
                  <option value="STUDENT">학생</option>
                </select>
              </div>
              <div>
                <label className="label">소득 수준</label>
                <select
                  {...register('incomeBracket', { valueAsNumber: true })}
                  className="input"
                >
                  {INCOME_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </FormSection>

          <FormSection title="추가 상황" desc="해당되는 항목을 선택해주세요.">
            <div
              className="two-col-grid-responsive"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
            >
              {CHECK_OPTIONS.map(({ key, label }, i) => {
                const active = checked[i];
                return (
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
                      {...register(key as 'isHomeowner')}
                      type="checkbox"
                      style={{ display: 'none' }}
                    />
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: active ? 'var(--accent)' : 'var(--bg-surface)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                      }}
                    >
                      {active && <Check size={10} strokeWidth={3} />}
                    </span>
                    {label}
                  </label>
                );
              })}
            </div>
            {hasChildren && (
              <div style={{ marginTop: 16 }}>
                <label className="label">자녀 수</label>
                <select
                  {...register('childrenCount', { valueAsNumber: true })}
                  className="input"
                  style={{ maxWidth: 200 }}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}명</option>
                  ))}
                </select>
              </div>
            )}
          </FormSection>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 24,
              gap: 12,
            }}
          >
            <div />
            <div
              className="profile-actions-responsive"
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
              {saved && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--success)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Check size={12} /> 저장되었습니다
                </span>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  void api<ProfileForm>('/profile').then((data) => reset(data)).catch(() => {
                    setValue('birthDate', '');
                  });
                }}
              >
                취소
              </button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> 저장 중...
                  </>
                ) : (
                  <>
                    <Check size={14} /> 변경사항 저장
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

function FormSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="form-section-responsive"
      style={{
        padding: '24px 0',
        borderBottom: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        gap: 32,
      }}
    >
      <div>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h3>
        {desc && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              margin: '4px 0 0',
              lineHeight: 1.5,
            }}
          >
            {desc}
          </p>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}
