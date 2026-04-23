export type HitlReason =
  | 'missing_profile'
  | 'empty_retrieval'
  | 'low_relevance'
  | 'ambiguous_intent';

export interface HitlChoice {
  id: string;
  label: string;
  description?: string;
}

export interface HitlQuestion {
  id: string;
  fieldKey: string;
  prompt: string;
  choices: HitlChoice[];
  allowCustom: boolean;
  allowSkip: boolean;
}

export interface HitlQuestionnaire {
  id: string;
  reason: HitlReason;
  detail: string;
  questions: HitlQuestion[];
}
