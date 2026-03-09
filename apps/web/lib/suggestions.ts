import type { UserProfile } from '../store/user.store';

export function getSuggestedQuestions(profile: UserProfile | null): string[] {
  if (!profile) {
    return [
      '청년 월세 보조금 신청 방법 알려줘',
      '저소득층 의료비 지원 정책이 있나요?',
      '신혼부부 전세 지원금 받을 수 있나요?',
      '65세 이상 어르신 복지 혜택 뭐가 있어요?',
    ];
  }

  const questions: string[] = [];

  /* 나이 기반 */
  const age = profile.birthDate ? getAge(profile.birthDate) : null;
  if (age !== null) {
    if (age >= 19 && age <= 34) {
      questions.push('청년 월세 보조금 신청 조건과 방법 알려줘');
      questions.push('청년 내일저축계좌 가입할 수 있나요?');
    }
    if (age >= 35 && age <= 55) {
      questions.push('중장년층을 위한 재취업 지원 정책 있나요?');
    }
    if (age >= 65) {
      questions.push('기초연금 받을 수 있는 조건이 어떻게 되나요?');
      questions.push('노인 의료비 감면 혜택 알려줘');
    }
    if (age >= 19 && age <= 39) {
      questions.push('신혼부부 주택 지원 정책 알려줘');
    }
  }

  /* 소득 기반 */
  const income = profile.incomeBracket;
  if (income !== undefined) {
    if (income <= 50) {
      questions.push('기초수급자 의료급여 지원 내용 알려줘');
      questions.push('차상위계층 혜택 전부 알려줘');
    } else if (income <= 80) {
      questions.push('중위소득 80% 이하 지원 가능한 복지 정책은?');
    }
  }

  /* 가구 형태 */
  if (profile.householdType === 'SINGLE_PARENT' || profile.isSingleParent) {
    questions.push('한부모가정 양육비 지원 받을 수 있나요?');
    questions.push('한부모가정 주거 지원 정책 알려줘');
  }

  if (profile.hasChildren && profile.childrenCount && profile.childrenCount >= 2) {
    questions.push('다자녀 가구 지원 혜택 알려줘');
  }

  if (profile.hasChildren) {
    questions.push('아이돌봄 서비스 신청 방법 알려줘');
  }

  /* 주거 기반 */
  if (!profile.isHomeowner) {
    questions.push('무주택자를 위한 공공임대주택 신청 방법은?');
  }

  /* 장애 */
  if (profile.isDisabled) {
    questions.push('장애인 복지서비스 어떤 것들을 받을 수 있나요?');
    questions.push('장애인 활동지원서비스 신청 조건은?');
  }

  /* 국가유공자 */
  if (profile.isVeteran) {
    questions.push('국가보훈대상자 의료비 지원 알려줘');
  }

  /* 직업 기반 */
  if (profile.occupationType === 'UNEMPLOYED') {
    questions.push('실업급여 신청 조건과 방법 알려줘');
    questions.push('취업성공패키지 신청할 수 있나요?');
  }
  if (profile.occupationType === 'STUDENT') {
    questions.push('대학생 학자금 대출 및 장학금 지원 알려줘');
  }

  /* 지역 */
  if (profile.sidoCode) {
    const sidoName = SIDO_NAME[profile.sidoCode];
    if (sidoName) {
      questions.push(`${sidoName} 지역 복지 혜택 알려줘`);
    }
  }

  /* 공통 */
  questions.push('내 조건에 맞는 복지 혜택 전체 목록 보여줘');

  return questions.slice(0, 6);
}

function getAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const SIDO_NAME: Record<string, string> = {
  '11': '서울', '26': '부산', '27': '대구', '28': '인천',
  '29': '광주', '30': '대전', '31': '울산', '36': '세종',
  '41': '경기', '43': '충북', '44': '충남', '45': '전북',
  '46': '전남', '47': '경북', '48': '경남', '50': '제주',
};
