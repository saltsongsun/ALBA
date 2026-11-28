/**
 * 외주 업체·전문가가 받을 대금의 지급일 표시 (견적·대금 화면 · 홈 '받을 대금').
 * 짧은 한 마디로: 지급 완료 · n일 지남 · 오늘 지급 · D-n · 협의 중 — 늦은 대금이 바로 눈에 띄게
 */
export type DueTone = 'paid' | 'late' | 'today' | 'soon' | 'none'

const day = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function payDue(due: string | null | undefined, paidAt: string | null | undefined, today: string): { label: string; tone: DueTone; days: number } {
  if (paidAt) return { label: '지급 완료', tone: 'paid', days: 0 }
  if (!due) return { label: '협의 중', tone: 'none', days: 0 }
  const d = Math.round((day(due) - day(today)) / 86_400_000)
  if (d < 0) return { label: `${-d}일 지남`, tone: 'late', days: -d }
  if (d === 0) return { label: '오늘 지급', tone: 'today', days: 0 }
  return { label: `D-${d}`, tone: 'soon', days: d }
}

/** 배지 색 (지난 대금은 빨강, 오늘은 진한 노랑) */
export const DUE_TONE: Record<DueTone, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  late: 'bg-rose-50 text-rose-600',
  today: 'bg-amber-100 text-amber-800',
  soon: 'bg-amber-50 text-amber-700',
  none: 'bg-bg text-mute',
}

/**
 * ✏️ 정기 개선 2026-11-28 17:36: 견적 마감 배지 (외주 업체 홈 · 견적·대금 · 관리자 견적 목록이 같은 말을 쓰게)
 * 마감일이 지났으면 '지남'(빨강) · 오늘이면 '오늘까지' · 내일이면 '내일까지' — 그 밖에는 배지 없음
 */
export function quoteDue(due: string | null | undefined, today: string): { text: string; tone: string; key: 'late' | 'today' | 'tomorrow' } | null {
  if (!due) return null
  const d = Math.round((day(due) - day(today)) / 86_400_000)
  if (d < 0) return { text: '지남', tone: 'bg-rose-50 text-rose-600', key: 'late' }
  if (d === 0) return { text: '오늘까지', tone: 'bg-amber-100 text-amber-800', key: 'today' }
  if (d === 1) return { text: '내일까지', tone: 'bg-amber-50 text-amber-700', key: 'tomorrow' }
  return null
}
