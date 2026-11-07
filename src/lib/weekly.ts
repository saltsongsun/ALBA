import 'server-only'
import { db } from './db'
import { calcDay, scheduledEnd, shiftOf, type PayRule } from './pay'
import { dateList, kstAt } from './time'
import type { Job } from './types'

/**
 * 주휴수당 (사용자 요청 2026-11-07 "여러 일을 진행할 때 주휴수당 요건을 확인해서 자동으로 계산 · 정산에 자동 포함").
 *
 * 규칙 (근로기준법 제55조·제18조 제3항 · 회사(사업주)별 · 월~일 한 주 단위):
 *  · 대상: 근로자로 일한 알바 공고 (일용근로소득) — 사업소득 3.3%·기타소득 8.8%·전문가 의뢰는 근로자가 아니라 빼고, 취소·임시 공고도 빼고
 *  · 요건 ① 그 회사에서 한 주 소정근로시간(공고·변경된 근무시간에서 휴게를 뺀 시간, 하루 8시간까지) 합이 15시간 이상
 *          ② 그 주에 잡힌 근무일을 모두 나옴 (출근·퇴근 기록이 있음 = 개근)
 *  · 금액: 한 주 소정근로시간(40시간까지) ÷ 40 × 8시간 × 시급 (일급 공고는 일급 ÷ 그날 소정시간으로 시급 환산 · 연장·야간·수당은 빼고 기본 임금만)
 *  · 그 주 마지막 근무일 기록에 붙어 그 공고의 정산(명세서·정산표·신고자료)에 '주휴수당'으로 들어감
 *  · 자동 포함은 WEEKLY_PAY_FROM 주부터 (그 전 주는 이미 정산·지급이 끝나 금액을 바꾸지 않고, 관리자 화면에서 확인용으로만 보임)
 */
export const WEEKLY_PAY_FROM = '2026-11-02'
/** 주휴 요건: 한 주 소정근로시간 15시간 */
export const WEEKLY_MIN_MINUTES = 15 * 60
const DAY = 86_400_000

/** 날짜(YYYY-MM-DD)에 n일 더하기 */
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

/** 그 날짜가 속한 주의 월요일 */
export function weekStart(date: string): string {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7 // 월=0 … 일=6
  return addDays(date, -dow)
}

export type WeekJob = PayRule & Pick<Job, 'id' | 'title' | 'company_id' | 'start_date' | 'end_date' | 'status' | 'audience'>

/** 주휴수당을 따지는 공고: 근로자(일용근로소득) 알바 공고만 */
export const weeklyJob = (j: Pick<Job, 'audience' | 'tax_type' | 'status'>) => j.audience !== 'expert' && j.tax_type === 'daily' && j.status !== 'cancelled' && j.status !== 'draft'

const JOB_COLS =
  'id, title, company_id, start_date, end_date, status, audience, pay_type, hourly_wage, daily_wage, break_mode, break_minutes, round_unit, early_clamp, start_time, end_time, premium_enabled, allowance, tax_type, employment_insurance'

export type WeekAtt = {
  id: string
  user_id: string
  job_id: string
  work_date: string
  clock_in: string | null
  clock_out: string | null
  adj_out: string | null
  sched_start: string | null
  sched_end: string | null
}

/** 그날 예정대로 일했을 때의 하루 지급액 (예상 인건비용 · 연장·야간 가산·수당 포함) */
export function plannedPay(job: PayRule, date: string, att?: Pick<WeekAtt, 'sched_start' | 'sched_end'> | null) {
  const shift = shiftOf(job, att)
  return calcDay({ ...job, ...shift, early_clamp: false }, {
    work_date: date,
    clock_in: kstAt(date, shift.start_time).toISOString(),
    clock_out: scheduledEnd(shift, date).toISOString(),
    adj_in: null,
    adj_out: null,
    break_override: null,
    extra_pay: 0,
    deduction: 0,
  })
}

/** 그날 소정근로 (공고·변경된 시작~종료에서 휴게를 뺀 인정 시간, 하루 8시간까지) · 그날 시급(일급은 환산) */
function plannedDay(job: WeekJob, date: string, att?: Pick<WeekAtt, 'sched_start' | 'sched_end'> | null) {
  const shift = shiftOf(job, att)
  const start = kstAt(date, shift.start_time)
  const end = scheduledEnd(shift, date)
  const d = calcDay({ ...job, ...shift, early_clamp: false }, {
    work_date: date,
    clock_in: start.toISOString(),
    clock_out: end.toISOString(),
    adj_in: null,
    adj_out: null,
    break_override: null,
    extra_pay: 0,
    deduction: 0,
  })
  const minutes = Math.min(480, d.paidMin)
  const hourly = job.pay_type === 'daily' ? (d.paidMin > 0 ? job.daily_wage / (d.paidMin / 60) : 0) : job.hourly_wage
  return { minutes, hourly, end }
}

export type WeekDay = { date: string; jobId: string; title: string; minutes: number; done: boolean; missed: boolean; attId: string | null }
export type WeekStatus = 'eligible' | 'pending' | 'short' | 'absent'
export type WeekCheck = {
  userId: string
  weekStart: string
  weekEnd: string
  days: WeekDay[]
  /** 한 주 소정근로시간(분) */
  minutes: number
  /** 기본 시급 (여러 공고면 시간으로 가중 평균) */
  hourly: number
  /** 주휴 시간(분) = 소정(40시간까지) ÷ 40 × 8시간 */
  holidayMin: number
  /** 주휴수당 (원) — 요건을 채웠거나(eligible) 남은 날을 다 나오면(pending) 받을 금액 */
  amount: number
  /** 요건과 상관없이 이 시간이면 받을 금액 (15시간을 넘는지 미리 볼 때) */
  potential: number
  status: WeekStatus
  /** 쉬운 말 설명 (예: '한 주 12시간 · 15시간 미만', '11/5(수) 결근') */
  reason: string
  /** 금액이 붙는 기록 (그 주 마지막 근무일) — 정산에 자동으로 들어갈 때만 */
  attachTo: string | null
  /** 자동 포함 전 주 (확인용) */
  before: boolean
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/**
 * 한 사람·한 회사의 주별 주휴 확인 (계산만 · DB를 읽지 않음).
 * jobs: 그 회사 공고 · apps: 확정된 지원(가능한 날짜) · atts: 그 기간 출퇴근 기록
 */
export function checkWeeks(
  userId: string,
  jobs: Map<string, WeekJob>,
  apps: { job_id: string; available_dates: string[] | null }[],
  atts: WeekAtt[],
  from: string,
  to: string,
  now = Date.now(),
): WeekCheck[] {
  const ws = weekStart(from)
  const we = addDays(weekStart(to), 6)
  // 잡힌 근무일: 확정된 공고의 날짜(고른 날짜가 있으면 그날만) + 실제로 일한 기록이 있는 날 (같은 공고·같은 날은 한 번)
  const planned = new Map<string, { job: WeekJob; date: string }>()
  for (const a of apps) {
    const job = jobs.get(a.job_id)
    if (!job || !weeklyJob(job)) continue
    const s = job.start_date > ws ? job.start_date : ws
    const e = job.end_date < we ? job.end_date : we
    if (s > e) continue
    for (const date of dateList(s, e)) {
      if (a.available_dates?.length && !a.available_dates.includes(date)) continue
      planned.set(`${job.id}|${date}`, { job, date })
    }
  }
  const mine = atts.filter((a) => a.user_id === userId)
  for (const a of mine) {
    const job = jobs.get(a.job_id)
    if (job && weeklyJob(job) && a.work_date >= ws && a.work_date <= we) planned.set(`${job.id}|${a.work_date}`, { job, date: a.work_date })
  }
  const byWeek = new Map<string, WeekDay[]>()
  const meta = new Map<string, { hourly: number; minutes: number; end: number }>()
  for (const [key, { job, date }] of planned) {
    const att = mine.find((a) => a.job_id === job.id && a.work_date === date) ?? null
    const p = plannedDay(job, date, att)
    const done = !!att && !!att.clock_in && !!(att.adj_out ?? att.clock_out)
    const over = now >= p.end.getTime()
    const day: WeekDay = { date, jobId: job.id, title: job.title, minutes: p.minutes, done, missed: over && !att, attId: att?.id ?? null }
    meta.set(key, { hourly: p.hourly, minutes: p.minutes, end: p.end.getTime() })
    const w = weekStart(date)
    byWeek.set(w, [...(byWeek.get(w) ?? []), day])
  }
  const out: WeekCheck[] = []
  for (const [w, days] of byWeek) {
    days.sort((a, b) => a.date.localeCompare(b.date) || (meta.get(`${a.jobId}|${a.date}`)!.end - meta.get(`${b.jobId}|${b.date}`)!.end))
    // 하루 소정근로는 8시간까지 (같은 날 공고 둘이면 합쳐서)
    const perDate = new Map<string, number>()
    for (const d of days) perDate.set(d.date, (perDate.get(d.date) ?? 0) + d.minutes)
    const minutes = [...perDate.values()].reduce((s, m) => s + Math.min(480, m), 0)
    const paidMin = days.reduce((s, d) => s + d.minutes, 0)
    const hourly = paidMin ? days.reduce((s, d) => s + meta.get(`${d.jobId}|${d.date}`)!.hourly * d.minutes, 0) / paidMin : 0
    const holidayMin = Math.floor((Math.min(minutes, 2400) / 2400) * 480)
    const amount = Math.floor((holidayMin / 60) * hourly)
    const missed = days.filter((d) => d.missed)
    const left = days.filter((d) => !d.done)
    let status: WeekStatus
    let reason: string
    if (minutes < WEEKLY_MIN_MINUTES) {
      status = 'short'
      reason = `한 주 ${hoursText(minutes)} · 15시간 미만`
    } else if (missed.length) {
      status = 'absent'
      reason = `${missed.map((d) => md(d.date)).join('·')} 결근`
    } else if (left.length) {
      status = 'pending'
      reason = `남은 근무 ${new Set(left.map((d) => d.date)).size}일 다 나오면`
    } else {
      status = 'eligible'
      reason = `한 주 ${hoursText(minutes)} · 개근`
    }
    const before = w < WEEKLY_PAY_FROM
    const last = days[days.length - 1]
    out.push({
      userId,
      weekStart: w,
      weekEnd: addDays(w, 6),
      days,
      minutes,
      hourly: Math.round(hourly),
      holidayMin,
      amount: status === 'eligible' || status === 'pending' ? amount : 0,
      potential: minutes >= WEEKLY_MIN_MINUTES ? amount : 0,
      status,
      reason,
      attachTo: status === 'eligible' && !before ? last.attId : null,
      before,
    })
  }
  return out.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

/** 분 → '15시간' · '12시간 30분' */
export function hoursText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}

type WeekApp = { user_id: string; job_id: string; available_dates: string[] | null; status: string; job: WeekJob | null }
type WeekData = { ws: string; we: string; apps: WeekApp[]; atts: WeekAtt[]; jobs: Map<string, WeekJob> }

/** 한 회사의 그 기간 확정 지원·출퇴근 기록·공고를 읽음 (userIds가 없으면 그 회사 모든 사람) */
async function loadWeekData(companyId: string, from: string, to: string, userIds?: string[]): Promise<WeekData> {
  const ws = weekStart(from)
  const we = addDays(weekStart(to), 6)
  let appsQ = db()
    .from('applications')
    .select(`user_id, job_id, available_dates, status, job:jobs(${JOB_COLS})`)
    .eq('company_id', companyId)
    .eq('status', 'approved')
  let attsQ = db()
    .from('attendance')
    .select('id, user_id, job_id, work_date, clock_in, clock_out, adj_out, sched_start, sched_end')
    .eq('company_id', companyId)
    .gte('work_date', ws)
    .lte('work_date', we)
  if (userIds) {
    appsQ = appsQ.in('user_id', userIds)
    attsQ = attsQ.in('user_id', userIds)
  }
  const [{ data: appRows }, { data: attRows }] = await Promise.all([appsQ.limit(5000), attsQ.limit(20000)])
  const apps = ((appRows ?? []) as unknown as WeekApp[]).filter(
    (a) => a.status === 'approved' && !!a.job && a.job.company_id === companyId && a.job.start_date <= we && a.job.end_date >= ws && (!userIds || userIds.includes(a.user_id)),
  )
  const atts = ((attRows ?? []) as WeekAtt[]).filter((a) => a.work_date >= ws && a.work_date <= we && (!userIds || userIds.includes(a.user_id)))
  const jobs = new Map(apps.map((a) => [a.job!.id, a.job!]))
  // 기록만 있고 지원(확정)이 없는 공고도 (관리자가 직접 넣은 기록 등)
  const missingJobs = [...new Set(atts.map((a) => a.job_id).filter((id) => !jobs.has(id)))]
  if (missingJobs.length) {
    const { data } = await db().from('jobs').select(JOB_COLS).eq('company_id', companyId).in('id', missingJobs)
    for (const j of (data ?? []) as WeekJob[]) if (j.company_id === companyId) jobs.set(j.id, j)
  }
  return { ws, we, apps, atts, jobs }
}

/**
 * 한 회사의 주휴 확인 (DB에서 읽음). userIds가 없으면 그 기간 그 회사에서 일정·기록이 있는 모든 사람
 */
export async function weeklyChecks(companyId: string, from: string, to: string, userIds?: string[], now = Date.now()): Promise<WeekCheck[]> {
  if (userIds && !userIds.length) return []
  const { ws, we, apps, atts, jobs } = await loadWeekData(companyId, from, to, userIds)
  const users = userIds ?? [...new Set([...apps.map((a) => a.user_id), ...atts.map((a) => a.user_id)])]
  return users.flatMap((u) =>
    checkWeeks(
      u,
      jobs,
      apps.filter((a) => a.user_id === u),
      atts,
      ws,
      we,
      now,
    ),
  )
}

/** 이 공고를 확정하면(추가 근로) 생기는 주휴 변화 — 관리자 화면에만 (근무자에게는 보이지 않음) */
export type WeekImpact = {
  weekStart: string
  /** 확정 전 그 주 소정근로(분) · 확정 뒤 */
  before: number
  after: number
  /** 확정 뒤 그 주 주휴수당 (요건대로 개근하면) */
  amount: number
  /** becomes: 확정하면 15시간을 넘어 주휴수당을 줘야 함 · already: 이미 대상인 주에 시간이 늘어남 */
  kind: 'becomes' | 'already'
}

/**
 * 지원자(대기·확정)마다: 이 공고를 확정하면 같은 회사 다른 공고와 합쳐 한 주 15시간을 넘는지.
 * 근로자(일용근로소득) 알바 공고만 · 자동 포함 전 주는 빼고 · 이미 확정된 사람은 지금 상태(이미 들어 있음)
 */
export async function weeklyImpact(
  job: WeekJob,
  apps: { user_id: string; status: string; available_dates: string[] | null }[],
  now = Date.now(),
): Promise<Map<string, WeekImpact>> {
  const out = new Map<string, WeekImpact>()
  const people = apps.filter((a) => a.status === 'applied' || a.status === 'approved')
  if (!weeklyJob(job) || !people.length || addDays(weekStart(job.end_date), 6) < WEEKLY_PAY_FROM) return out
  const users = [...new Set(people.map((a) => a.user_id))]
  const data = await loadWeekData(job.company_id, job.start_date, job.end_date, users)
  const jobs = new Map(data.jobs).set(job.id, job)
  for (const a of people) {
    const base = data.apps.filter((x) => x.user_id === a.user_id && x.job_id !== job.id)
    const mine = { user_id: a.user_id, job_id: job.id, available_dates: a.available_dates, status: 'approved', job }
    const before = checkWeeks(a.user_id, jobs, base, data.atts, data.ws, data.we, now)
    const after = checkWeeks(a.user_id, jobs, [...base, mine], data.atts, data.ws, data.we, now)
    let best: WeekImpact | null = null
    for (const w of after) {
      if (w.before || w.minutes < WEEKLY_MIN_MINUTES) continue
      const b = before.find((x) => x.weekStart === w.weekStart)?.minutes ?? 0
      if (b === w.minutes) continue // 이 공고가 그 주에 시간을 더하지 않음
      const imp: WeekImpact = { weekStart: w.weekStart, before: b, after: w.minutes, amount: w.potential, kind: b < WEEKLY_MIN_MINUTES ? 'becomes' : 'already' }
      if (!best || (imp.kind === 'becomes' && best.kind !== 'becomes')) best = imp
    }
    if (best) out.set(a.user_id, best)
  }
  return out
}

/** 출퇴근 기록 id → 그 기록에 붙는 주휴수당 (요건을 채운 주의 마지막 근무일만) */
export async function weeklyPayMap(companyId: string, rows: { user_id: string; work_date: string }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const dates = rows.map((r) => r.work_date).filter((d) => d >= WEEKLY_PAY_FROM).sort()
  if (!dates.length) return out
  const users = [...new Set(rows.filter((r) => r.work_date >= WEEKLY_PAY_FROM).map((r) => r.user_id))]
  const checks = await weeklyChecks(companyId, dates[0], dates[dates.length - 1], users)
  for (const c of checks) if (c.attachTo && c.amount > 0) out.set(c.attachTo, c.amount)
  return out
}

/** 출퇴근 기록에 주휴수당(weekly_pay)을 붙여 돌려줌 (정산 계산 calcDay가 금액에 넣음) — 회사마다 따로 */
export async function withWeeklyPay<T extends { id: string; user_id: string; work_date: string; company_id?: string; job?: { company_id: string } | null }>(
  rows: T[],
  companyId?: string,
): Promise<(T & { weekly_pay: number })[]> {
  const byCompany = new Map<string, T[]>()
  for (const r of rows) {
    const c = companyId ?? r.company_id ?? r.job?.company_id
    if (c) byCompany.set(c, [...(byCompany.get(c) ?? []), r])
  }
  const maps = await Promise.all([...byCompany].map(([c, rs]) => weeklyPayMap(c, rs).catch(() => new Map<string, number>())))
  const pay = new Map<string, number>()
  for (const m of maps) for (const [k, v] of m) pay.set(k, v)
  return rows.map((r) => ({ ...r, weekly_pay: pay.get(r.id) ?? 0 }))
}
