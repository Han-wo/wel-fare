// 2024년 기준 가구원수별 기준 중위소득 (월, 원)
const BASE_INCOME_BY_HOUSEHOLD: Record<number, number> = {
  1: 2228445,
  2: 3682609,
  3: 4714657,
  4: 5729913,
  5: 6695735,
  6: 7618369,
};

/** 가구원수 + 연소득으로 중위소득 백분율 계산 */
export function calcIncomeBracket(annualIncome: number, householdCount: number): number {
  const count = Math.min(householdCount, 6);
  const monthlyIncome = annualIncome / 12;
  const baseMonthly = BASE_INCOME_BY_HOUSEHOLD[count] ?? BASE_INCOME_BY_HOUSEHOLD[6];
  const ratio = (monthlyIncome / baseMonthly) * 100;

  const brackets = [40, 50, 60, 70, 80, 100, 120, 150, 200];
  return brackets.find((b) => ratio <= b) ?? 200;
}
