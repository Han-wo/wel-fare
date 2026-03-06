export type PolicyCategory =
  | 'HOUSING'
  | 'MEDICAL'
  | 'EDUCATION'
  | 'EMPLOYMENT'
  | 'FINANCE'
  | 'CULTURE'
  | 'CHILDCARE'
  | 'ELDERLY'
  | 'DISABILITY';

export type PolicyStatus = 'ACTIVE' | 'CLOSED' | 'UPCOMING' | 'SUSPENDED';
export type BenefitType = 'CASH' | 'SERVICE' | 'LOAN' | 'GOODS';

export type ReqType =
  | 'AGE'
  | 'INCOME'
  | 'REGION'
  | 'HOUSEHOLD'
  | 'EMPLOYMENT'
  | 'HOUSING'
  | 'DISABILITY'
  | 'VETERAN'
  | 'CHILDREN';

export interface PolicyRequirement {
  id: string;
  policyId: string;
  reqType: ReqType;
  operator: 'BETWEEN' | 'LTE' | 'GTE' | 'EQ' | 'IN' | 'HAS';
  minValue?: number;
  maxValue?: number;
  valueList?: string[];
  description?: string;
}

export interface Policy {
  id: string;
  externalId?: string;
  source: string;
  name: string;
  category: PolicyCategory;
  subcategory?: string;
  provider?: string;
  summary?: string;
  content?: string;
  targetSummary?: string;
  benefitAmount?: number;
  benefitType?: BenefitType;
  applicationStart?: string;
  applicationEnd?: string;
  status: PolicyStatus;
  applyUrl?: string;
  contact?: string;
  sidoCodes?: string[];
  tags?: string[];
  viewCount: number;
  requirements?: PolicyRequirement[];
  createdAt: string;
  updatedAt: string;
}

export interface PolicySearchParams {
  q?: string;
  category?: PolicyCategory;
  sidoCode?: string;
  status?: PolicyStatus;
  benefitType?: BenefitType;
  page?: number;
  limit?: number;
}
