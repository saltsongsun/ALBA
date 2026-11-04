/**
 * 근로계약서·임금명세서에 꼭 들어가는 회사 정보 4가지
 * (회사 설정 맨 위 체크 목록 · 대시보드 '회사 정보 채우기' · 새 공고 화면 안내가 같은 기준을 씀)
 */
export const SETUP_ITEMS = [
  { key: 'business_no', label: '사업자등록번호' },
  { key: 'company_address', label: '회사 주소' },
  { key: 'seal', label: '직인' },
  { key: 'contact_phone', label: '문의 연락처' },
] as const
export type SetupKey = (typeof SETUP_ITEMS)[number]['key']

/** 아직 비어 있는 항목 (회사 설정 순서대로) */
export function missingSetup(
  s: { business_no?: string | null; company_address?: string | null; contact_phone?: string | null },
  seal: boolean,
): (typeof SETUP_ITEMS)[number][] {
  const done: Record<SetupKey, boolean> = {
    business_no: !!s.business_no,
    company_address: !!s.company_address,
    seal,
    contact_phone: !!s.contact_phone,
  }
  return SETUP_ITEMS.filter((it) => !done[it.key])
}
