import { dateList, kstAt } from './time'
import type { Job } from './types'

export type Shift = Pick<Job, 'start_date' | 'end_date' | 'start_time' | 'end_time'> & {
  /** 여러 날 행사에서 고른 날짜 (null이면 전체) */
  dates?: string[] | null
}

/** 근무하는 날마다 [시작, 끝] (밤을 넘기면 다음 날까지) */
function windows(s: Shift): [number, number][] {
  const days = s.dates?.length ? s.dates : dateList(s.start_date, s.end_date)
  return days.map((d) => {
    const a = kstAt(d, s.start_time).getTime()
    let b = kstAt(d, s.end_time).getTime()
    if (b <= a) b += 24 * 3600_000
    return [a, b]
  })
}

/** 두 근무가 시간이 겹치는지 (같은 날 같은 시간대). 겹치면 처음 겹치는 시각(ISO), 아니면 null */
export function overlapDay(a: Shift, b: Shift): string | null {
  const wb = windows(b)
  for (const [s, e] of windows(a)) {
    const hit = wb.find(([s2, e2]) => s < e2 && s2 < e)
    if (hit) return new Date(Math.max(s, hit[0])).toISOString()
  }
  return null
}
