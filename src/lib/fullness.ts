import { headcountTbd } from './jobFields'
import { workOver } from './pay'
import { staffByDay } from './staffing'
import { dateList } from './time'
import type { Job } from './types'

/** 공고 목록·관리자 홈에서 '다 찼는지' 볼 때 쓰는 지원 정보 (날짜별로 세려고 가능한 날도 함께) */
export const JOB_WITH_APP_DATES = '*, applications(status, available_dates), company:companies(company_name, verified)'

type AppLite = { status: string; available_dates?: string[] | null }

/**
 * 남은 날(오늘 포함)이 모두 확정으로 다 찼는지 — 지원자 탭 '✓ 인원 다 참'과 같은 기준
 * · 끝난 행사(마지막 날 근무까지 끝남)·인원 미정·취소·임시저장·모집 인원 0이면 false
 * · 여러 날 행사는 날짜별로 (근무 가능한 날을 고르지 않은 확정자는 모든 날로 셈)
 * (정기 개선 2026-11-25 15:35 공고 목록 → 17:35 관리자 홈과 함께 쓰려고 옮김)
 */
export function fullAhead(j: Pick<Job, 'start_date' | 'end_date' | 'start_time' | 'end_time' | 'headcount' | 'status' | 'hidden_fields'> & { applications?: AppLite[] | null }, today: string): boolean {
  if (headcountTbd(j) || j.status === 'cancelled' || j.status === 'draft' || !(j.headcount > 0)) return false
  if (j.end_date < today || (j.end_date === today && workOver(j, j.end_date))) return false
  const ahead = dateList(j.start_date, j.end_date).filter((d) => d >= today)
  if (!ahead.length) return false
  const approved = (j.applications ?? []).filter((a) => a.status === 'approved').map((a) => ({ available_dates: a.available_dates ?? null }))
  const byDay = staffByDay(ahead, approved)
  return ahead.every((d) => byDay[d] >= j.headcount)
}
