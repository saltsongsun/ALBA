import type { Application } from './types'

type Avail = Pick<Application, 'available_dates'>

/** 날짜마다 근무하기로 한 인원 (근무 가능한 날을 고르지 않았으면 모든 날) */
export function staffByDay(dates: string[], apps: Avail[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(dates.map((d) => [d, 0]))
  for (const a of apps) for (const d of a.available_dates ?? dates) if (d in out) out[d]++
  return out
}

/** 이 사람을 확정하면 모집 인원을 넘기게 되는 날 (그 사람이 가능한 날 중 이미 다 찬 날) */
export function fullDays(a: Avail, dates: string[], byDay: Record<string, number>, headcount: number): string[] {
  return (a.available_dates ?? dates).filter((d) => d in byDay && byDay[d] >= headcount)
}
