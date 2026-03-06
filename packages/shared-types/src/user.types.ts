export type OccupationType =
  | 'EMPLOYEE'
  | 'FREELANCER'
  | 'SELF_EMPLOYED'
  | 'UNEMPLOYED'
  | 'STUDENT';

export type HouseholdType = 'SINGLE' | 'COUPLE' | 'FAMILY' | 'SINGLE_PARENT';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type IncomeBracket = 40 | 50 | 60 | 70 | 80 | 100 | 120 | 150 | 200;

export interface UserProfile {
  id: string;
  userId: string;
  birthDate?: string;
  gender?: Gender;
  sidoCode?: string;
  sigunguCode?: string;
  dongName?: string;
  householdType?: HouseholdType;
  householdCount: number;
  occupationType?: OccupationType;
  employmentMonths?: number;
  annualIncome?: number;
  incomeBracket?: IncomeBracket;
  isHomeowner: boolean;
  isDisabled: boolean;
  disabilityGrade?: number;
  isVeteran: boolean;
  isSingleParent: boolean;
  hasChildren: boolean;
  childrenCount: number;
  isImmigrant: boolean;
  educationLevel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  birthDate: string;
  gender: Gender;
  sidoCode: string;
  sigunguCode: string;
  dongName?: string;
  householdType: HouseholdType;
  householdCount: number;
  occupationType: OccupationType;
  incomeBracket: IncomeBracket;
  annualIncome?: number;
  isHomeowner: boolean;
  isDisabled?: boolean;
  disabilityGrade?: number;
  isVeteran?: boolean;
  isSingleParent?: boolean;
  hasChildren?: boolean;
  childrenCount?: number;
}
