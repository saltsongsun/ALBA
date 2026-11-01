import type { VendorPayment } from './types'

/** 외주사 분야 (고르기 쉽게, 직접 써도 됨) */
export const VENDOR_CATEGORIES = ['인력', '장비·렌탈', '음향·조명', '무대·설치', '경호·안전', '운송', '케이터링', '디자인·인쇄', '기타'] as const

export const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: '견적 대기', cls: 'bg-gray-100 text-sub' },
  submitted: { label: '견적 받음', cls: 'bg-brand-50 text-brand-700' },
  selected: { label: '선정', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '미선정', cls: 'bg-gray-100 text-mute' },
}

/** 지급 상태: 지급 완료 / 지급일 지남 / 곧(3일 안) / 예정 */
export function payState(p: Pick<VendorPayment, 'paid_at' | 'due_date'>, today: string): { key: 'paid' | 'overdue' | 'soon' | 'planned'; label: string; cls: string } {
  if (p.paid_at) return { key: 'paid', label: '지급 완료', cls: 'bg-emerald-50 text-emerald-700' }
  if (p.due_date && p.due_date < today) return { key: 'overdue', label: '지급일 지남', cls: 'bg-rose-600 text-white' }
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10)
  if (p.due_date && p.due_date <= soon) return { key: 'soon', label: p.due_date === today ? '오늘 지급' : '곧 지급', cls: 'bg-amber-100 text-amber-800' }
  return { key: 'planned', label: '지급 예정', cls: 'bg-gray-100 text-sub' }
}

/** 업체 입력 링크 주소 */
export const quoteLink = (origin: string, token: string) => `${origin}/quote/${token}`

/** 견적 요청 문자·카톡 문구 */
export function quoteMessage(o: { company: string; vendor: string; title: string; due: string | null; link: string }) {
  return [
    `[${o.company}] ${o.vendor} 담당자님, 견적을 요청드립니다.`,
    `요청: ${o.title}`,
    o.due ? `견적 마감: ${o.due}` : '',
    `아래 링크에서 내용을 보고 견적 금액을 입력해 주세요 (로그인 필요 없음).`,
    o.link,
  ]
    .filter(Boolean)
    .join('\n')
}
