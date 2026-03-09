'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { User, Save, Loader2, CheckCircle } from 'lucide-react';
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

const inputCls = 'w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-500 transition';
const selectCls = `${inputCls} appearance-none`;
const labelCls = 'block text-xs font-medium text-gray-400 mb-1.5';

export default function ProfilePage() {
  const { setProfile, profile: storeProfile } = useUserStore();
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm<ProfileForm>();

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
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#09090b]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center">
            <User size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">내 프로필</h1>
            <p className="text-gray-400 text-sm">입력한 정보를 바탕으로 맞춤 복지 혜택을 추천합니다</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* 기본 정보 */}
          <Section title="기본 정보">
            <div className="grid grid-cols-2 gap-4">
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

          {/* 거주 및 가구 */}
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
              <div className="grid grid-cols-2 gap-4">
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
                    {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n}인</option>)}
                    <option value={7}>7인 이상</option>
                  </select>
                </div>
              </div>
            </div>
          </Section>

          {/* 직업 및 소득 */}
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

          {/* 특수 상황 */}
          <Section title="추가 정보">
            <div className="space-y-2">
              {[
                { key: 'isHomeowner' as const, label: '주택 소유자 (본인 명의)' },
                { key: 'isDisabled' as const, label: '장애인 등록' },
                { key: 'isVeteran' as const, label: '국가보훈대상자' },
                { key: 'isSingleParent' as const, label: '한부모가정' },
                { key: 'hasChildren' as const, label: '자녀 있음 (만 18세 미만)' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 py-2.5 px-4 rounded-xl border border-white/5 hover:border-white/10 cursor-pointer transition">
                  <input {...register(key)} type="checkbox" className="w-4 h-4 accent-brand-600" />
                  <span className="text-sm text-gray-300">{label}</span>
                </label>
              ))}
              {hasChildren && (
                <div className="pl-4">
                  <label className={labelCls}>자녀 수</label>
                  <select {...register('childrenCount', { valueAsNumber: true })} className={selectCls}>
                    {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}명</option>)}
                  </select>
                </div>
              )}
            </div>
          </Section>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <><Loader2 size={16} className="animate-spin" /> 저장 중...</>
            ) : saved ? (
              <><CheckCircle size={16} /> 저장되었습니다</>
            ) : (
              <><Save size={16} /> 저장하기</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  );
}
