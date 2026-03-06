export const SIDO_CODES: Record<string, string> = {
  '11': '서울특별시',
  '26': '부산광역시',
  '27': '대구광역시',
  '28': '인천광역시',
  '29': '광주광역시',
  '30': '대전광역시',
  '31': '울산광역시',
  '36': '세종특별자치시',
  '41': '경기도',
  '42': '강원특별자치도',
  '43': '충청북도',
  '44': '충청남도',
  '45': '전북특별자치도',
  '46': '전라남도',
  '47': '경상북도',
  '48': '경상남도',
  '50': '제주특별자치도',
};

export function getSidoName(code: string): string {
  return SIDO_CODES[code] ?? '알 수 없음';
}

export function getSidoCode(name: string): string | undefined {
  return Object.entries(SIDO_CODES).find(([, v]) => v === name)?.[0];
}
