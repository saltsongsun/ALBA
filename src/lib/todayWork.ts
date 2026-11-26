// ✏️ 새 파일 (정기 개선 2026-11-26 17:35)
// 근무자 한 사람의 '이 회사 오늘 근무' 한 줄 — 관리자 문의 대화 머리와 근무자 상세가 같은 기준으로 씀
// · 근무일을 고른 사람은 오늘이 그 날일 때만 '오늘' (아니면 다음 근무 날짜)
// · 시작 시각이 지났는데 출근 기록이 없으면 '출근 전'이 아니라 '미출근' (대시보드 '오늘 진행 행사' 전화 칩과 같은 기준)
// · 오늘 '늦어요'를 보냈으면 'HH:MM 도착', 현장 위치 확인을 요청했으면 '현장 확인 요청'을 짧게 함께
// 넘겨받는 자료는 모두 부르는 쪽에서 이 회사(company_id)로 거른 것이어야 함
import { workOver } from './pay'
import { parseLate, signalOf } from './signals'
import { fmtDate, hhmm, kstAt, kstDate, kstTime } from './time'

export type WorkJob = { id: string; title: string; start_date: string; end_date: string; start_time: string; end_time: string; status: string }
export type WorkApp = { job: WorkJob | null; available_dates?: string[] | null }
export type WorkAtt = { job_id: string; work_date?: string; clock_in: string; clock_out: string | null }
export type WorkMsg = { job_id: string | null; body: string; created_at: string; from_admin: boolean }

export type WorkLine = {
  /** 점 색 (bg-…) */
  dot: string
  /** 근무 중·미출근이면 점이 살짝 깜빡임 (움직임 줄이기면 점만) */
  live: boolean
  /** 굵게 보일 상태 한마디 */
  text: string
  /** 상태 뒤 짧은 덧말 (늦어요 · 현장 확인 요청) */
  told: { text: string; tone: string } | null
  title: string
  href: string
  state: 'working' | 'done' | 'before' | 'absent' | 'noRecord' | 'next'
}

const worksOn = (a: WorkApp, day: string) =>
  !!a.job && a.job.status !== 'cancelled' && a.job.start_date <= day && day <= a.job.end_date && (!a.available_dates?.length || a.available_dates.includes(day))

/** 이 사람의 다음 근무 날 (오늘 뒤 · 근무일을 골랐으면 그 날 중에서) */
function nextDay(a: WorkApp, today: string): string | null {
  const j = a.job
  if (!j || j.status === 'cancelled' || j.end_date <= today) return null
  if (a.available_dates?.length) return [...a.available_dates].filter((d) => d > today && d >= j.start_date && d <= j.end_date).sort()[0] ?? null
  return j.start_date > today ? j.start_date : null
}

export function todayWorkLine(apps: WorkApp[], atts: WorkAtt[], msgs: WorkMsg[], today = kstDate(), now = Date.now()): WorkLine | null {
  const todays = apps.filter((a) => worksOn(a, today)).map((a) => a.job!) as WorkJob[]
  const attOf = (jobId: string) => atts.find((x) => x.job_id === jobId && (!x.work_date || x.work_date === today))
  if (todays.length) {
    // 오늘 근무가 둘이면: 지금 근무 중인 것 → 아직 안 끝난 것(이른 시작부터) → 마지막 것
    const byStart = [...todays].sort((x, y) => x.start_time.localeCompare(y.start_time))
    const job =
      byStart.find((j) => { const t = attOf(j.id); return !!t && !t.clock_out }) ??
      byStart.find((j) => !workOver(j, today, now)) ??
      byStart[byStart.length - 1]
    const att = attOf(job.id)
    const href = `/admin/jobs/${job.id}?tab=att&date=${today}`
    const base = { title: job.title, href, told: null }
    if (att) {
      return att.clock_out
        ? { ...base, dot: 'bg-gray-400', live: false, text: `오늘 퇴근 ${kstTime(att.clock_out)}`, state: 'done' }
        : { ...base, dot: 'bg-emerald-500', live: true, text: `오늘 근무 중 · ${kstTime(att.clock_in)} 시작`, state: 'working' }
    }
    if (workOver(job, today, now)) return { ...base, dot: 'bg-amber-400', live: false, text: '오늘 근무 · 출근 기록 없음', state: 'noRecord' }
    if (kstAt(today, job.start_time).getTime() > now) {
      return { ...base, dot: 'bg-amber-400', live: false, text: `오늘 ${hhmm(job.start_time)}~${hhmm(job.end_time)} · 출근 전`, state: 'before' }
    }
    // 시작했는데 출근 기록 없음: 오늘 이 공고로 보낸 마지막 늦어요/현장 확인 요청
    const last = msgs
      .filter((m) => !m.from_admin && m.job_id === job.id && kstDate(m.created_at) === today && ['late', 'arrive'].includes(signalOf(m.body) ?? ''))
      .sort((x, y) => y.created_at.localeCompare(x.created_at))[0]
    const kind = last ? signalOf(last.body) : null
    const eta = kind === 'late' ? parseLate(last!.body)?.eta : null
    return {
      ...base,
      dot: 'bg-rose-500',
      live: true,
      text: `미출근 · ${hhmm(job.start_time)} 시작`,
      told: kind === 'late' ? { text: eta ? `${eta} 도착` : '늦어요', tone: 'text-amber-700' } : kind === 'arrive' ? { text: '현장 확인 요청', tone: 'text-brand-700' } : null,
      state: 'absent',
    }
  }
  const next = apps
    .map((a) => ({ a, d: nextDay(a, today) }))
    .filter((x): x is { a: WorkApp; d: string } => !!x.d)
    .sort((x, y) => x.d.localeCompare(y.d) || x.a.job!.start_time.localeCompare(y.a.job!.start_time))[0]
  if (!next) return null
  const j = next.a.job!
  return { dot: 'bg-sky-400', live: false, text: `다음 근무 ${fmtDate(next.d)} ${hhmm(j.start_time)}`, told: null, title: j.title, href: `/admin/jobs/${j.id}`, state: 'next' }
}
