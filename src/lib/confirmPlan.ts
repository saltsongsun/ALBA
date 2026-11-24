import { dateList } from './time'
import type { Job } from './types'
import { plannedPay } from './weekly'

/**
 * 확정한 일정 금액 (관리자에게만 · 사용자 요청 2026-11-24 "지원자를 확정하면 확정한 전체 일정 얼마인지 알려줘").
 * 확정한 사람이 공고 시간대로 일했을 때의 세전 금액 — 정산과 같은 하루 계산(calcDay · 연장·야간 가산·수당 포함)을 날짜마다 더함.
 * 주휴수당·실제 출퇴근은 빼고 '예상'으로만 (계산 규칙은 바꾸지 않음)
 */
export type Plan = { days: number; gross: number }

/** 이 사람이 일할 날 (지원 때 고른 날 중 지금 공고 날짜 안의 것 · 없으면 공고 전체 날짜) */
function daysOf(job: Pick<Job, 'start_date' | 'end_date'>, available: string[] | null): string[] {
  const all = dateList(job.start_date, job.end_date)
  const mine = (available ?? []).filter((d) => all.includes(d))
  return mine.length ? mine : all
}

/** 날짜마다 하루 예정 금액을 한 번만 계산해 두고 여러 사람에게 씀 */
export function planner(job: Job) {
  const memo = new Map<string, number>()
  const day = (d: string) => {
    if (!memo.has(d)) memo.set(d, plannedPay(job, d).gross)
    return memo.get(d)!
  }
  return (available: string[] | null): Plan => {
    const days = daysOf(job, available)
    return { days: days.length, gross: days.reduce((t, d) => t + day(d), 0) }
  }
}
