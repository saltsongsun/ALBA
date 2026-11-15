import type { JobCondition } from './types'

/**
 * 공고의 근무 조건 중 현장에서 자주 묻는 두 가지 (근무자 '쉬는 시간이 언제인가요?' 문의가 많음)
 * 담당자가 공고에 적은 글 그대로 — 계산하지 않음
 */
export function siteConditions(conds: JobCondition[] | null | undefined): { brk: JobCondition | null; meal: JobCondition | null } {
  const list = (conds ?? []).filter((c) => c.label?.trim() && c.value?.trim())
  const brk = list.find((c) => /휴게|쉬는/.test(c.label)) ?? null
  const meal = list.find((c) => c !== brk && /식사|점심|저녁|도시락|간식|식대/.test(c.label)) ?? null
  return { brk, meal }
}

/** 휴게 글에서 첫 'HH:MM~HH:MM' (예: '12:00~13:00 점심') → 지금 쉬는 시간인지 볼 때 */
export function breakWindow(text: string): { start: string; end: string } | null {
  const m = text.match(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/)
  if (!m) return null
  const pad = (h: string) => h.padStart(2, '0')
  const start = `${pad(m[1])}:${m[2]}`
  const end = `${pad(m[3])}:${m[4]}`
  return start < end ? { start, end } : null
}
