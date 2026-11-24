import 'server-only'
import { cache } from 'react'
import { allByIds, allPages, db, must } from './db'
import { withWeeklyPay } from './weekly'
import { workerRoomUnreadTotal } from './room'
import { APP_NAME } from './brand'
import { clientInfo } from './session'
import { calcDay, scheduledEnd, settle, shiftOf } from './pay'
import { fmtDate, kstDate } from './time'
import { isQuietNotice, needsReply, paidAfterAsk, parsePayday, SIGNAL } from './signals'
import { paydayDate, paydayGuess } from './payday'
import type { Application, Attendance, CompanySettings, Job, Settings } from './types'

const COMPANY_COLS =
  'company_name, ceo_name, business_no, company_address, company_phone, contact_name, contact_phone, default_hourly_wage, workplace_5plus'

const DEFAULT_SETTINGS: Settings = {
  company_name: '회사명 (설정에서 입력)',
  ceo_name: null,
  business_no: null,
  company_address: null,
  company_phone: null,
  contact_name: null,
  contact_phone: null,
  seal_image: null,
  default_hourly_wage: 10_320,
  workplace_5plus: true,
}

/**
 * 회사 정보 (회사마다 상호·대표·직인·기본 시급). 공고·서류는 그 공고의 회사(job.company_id),
 * 관리자 화면은 지금 보고 있는 회사(admin.companyId).
 * 직인 이미지(data URL, 수백 KB)는 화면에 그릴 때만 { seal: true }로 함께 읽습니다.
 */
export async function getSettings(companyId: string): Promise<CompanySettings>
export async function getSettings(companyId: string, opts: { seal: true }): Promise<Settings>
export async function getSettings(companyId: string, opts?: { seal: true }): Promise<CompanySettings | Settings> {
  const cols = opts?.seal ? `${COMPANY_COLS}, seal_image` : COMPANY_COLS
  const data = must(await db().from('companies').select(cols).eq('id', companyId).maybeSingle())
  return (data as Settings | null) ?? DEFAULT_SETTINGS
}

/** 기본 회사 (가장 먼저 만든 회사 = 앱 운영 회사): 로그인 화면 문의처 등 회사가 정해지지 않은 곳 */
export const platformCompanyId = cache(async (): Promise<string | null> => {
  const { data } = await db().from('companies').select('id, created_at').eq('active', true).order('created_at').limit(1)
  return ((data ?? []) as { id: string }[])[0]?.id ?? null
})

/** 해피워크 고객센터: 운영 회사의 문의함 중 그 회사 공고에 지원한 적 없는 회원의 문의 */
export const SUPPORT_NAME = `${APP_NAME} 고객센터`
export async function isSupportThread(companyId: string, userId: string): Promise<boolean> {
  if (companyId !== (await platformCompanyId())) return false
  const { count } = await db().from('applications').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('user_id', userId)
  return !count
}

export async function getPlatformSettings(): Promise<CompanySettings> {
  const id = await platformCompanyId()
  return id ? getSettings(id) : DEFAULT_SETTINGS
}

/** 직인이 등록돼 있는지만 (이미지는 읽지 않음) */
export async function hasSeal(companyId: string): Promise<boolean> {
  const { count } = await db()
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .eq('id', companyId)
    .not('seal_image', 'is', null)
  return (count ?? 0) > 0
}

export async function getJob(id: string): Promise<Job | null> {
  const { data } = await db().from('jobs').select('*').eq('id', id).maybeSingle()
  return (data as Job | null) ?? null
}

/** 공고 목록과 지원 상태를 한 번에 읽을 때의 select (공고별 인원은 countApps로 셉니다) */
export const JOB_WITH_APP_STATUS = '*, applications(status), company:companies(company_name, verified)'
/** company.verified: 해피워크가 확인한 회사 (근무자에게 '✓ 확인된 회사'로 보임) */
export type JobWithAppStatus = Job & { applications: { status: string }[] | null; company?: { company_name: string; verified?: boolean | null } | null }

/** select(JOB_WITH_APP_STATUS) 결과에서 공고별로 해당 상태의 지원 수를 셉니다. */
export function countApps(jobs: JobWithAppStatus[], status: Application['status']): Record<string, number> {
  const out: Record<string, number> = {}
  for (const j of jobs) out[j.id] = (j.applications ?? []).filter((a) => a.status === status).length
  return out
}

/** 공고별 확정 인원 수 */
export async function approvedCounts(jobIds: string[]): Promise<Record<string, number>> {
  if (!jobIds.length) return {}
  const rows = must(
    await db().from('applications').select('job_id').in('job_id', jobIds).eq('status', 'approved'),
  ) as { job_id: string }[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.job_id] = (out[r.job_id] ?? 0) + 1
  return out
}

/** 지원 확정 시 공고에 지정된 서류를 서명 대기 상태로 만들어 둡니다. */
/**
 * 확정한 여러 사람의 서명할 서류를 한 번에 준비 (서식은 한 번 · 이미 있는 서류는 묶어서 확인 · 없는 것만 한꺼번에 넣음).
 * 예전엔 한 사람씩 세 번씩 차례로 물어서, 수백 명을 한꺼번에 확정하면 서버 시간이 넘어 일부만 서류가 생길 수 있었음
 * (서류가 없으면 근무 시작 전 서명을 못 해서 현장에서 막힘)
 */
export async function ensurePendingDocsMany(job: Job, userIds: string[]): Promise<string[]> {
  const users = [...new Set(userIds)]
  if (!users.length || !job.required_docs?.length) return []
  const templates = must(
    await db().from('doc_templates').select('id, kind, title').in('id', job.required_docs),
  ) as { id: string; kind: string; title: string }[]
  // 근로계약서를 종이·다른 서비스(모두싸인 등)로 받는 공고는 앱 서명에서 뺌
  const need = (job.contract_method ?? 'app') === 'app' ? templates : templates.filter((t) => t.kind !== 'contract')
  if (!need.length) return []
  const existing = await allByIds<{ job_id: string; user_id: string; template_id: string | null; status: string }>(users, (part, a, b) =>
    db().from('signed_docs').select('id, job_id, user_id, template_id, status').eq('job_id', job.id).in('user_id', part).neq('status', 'void').order('id').range(a, b),
  )
  const have = new Set(existing.filter((e) => e.job_id === job.id && e.status !== 'void').map((e) => `${e.user_id}|${e.template_id}`))
  const rows = users.flatMap((u) =>
    need.filter((t) => !have.has(`${u}|${t.id}`)).map((t) => ({ job_id: job.id, user_id: u, template_id: t.id, kind: t.kind, title: t.title })),
  )
  for (let i = 0; i < rows.length; i += 500) must(await db().from('signed_docs').insert(rows.slice(i, i + 500)))
  // 새로 서류가 생긴 사람 (서류가 왔다고 알릴 사람)
  return [...new Set(rows.map((r) => r.user_id))]
}

/** 한 사람 (위와 같은 규칙) */
export async function ensurePendingDocs(job: Job, userId: string) {
  return ensurePendingDocsMany(job, [userId])
}

/**
 * 서명 서류(근로계약서 등)를 지금 보낼 때인지 — 사용자 요청 2026-11-24 "근로계약서는 확정 후 작성 말고 모집완료 후 작성으로".
 * · 모집을 마감했으면(모집마감·종료) 보냄
 * · 아직 모집 중이어도 근무가 오늘 시작하거나, 내일 시작하는데 저녁 6시(한국)가 지났으면 보냄
 *   (마감을 깜빡해도 근무 전에 서명하게 — 안전장치. 매일 저녁 6시 알림 작업이 내일 근무 확정자에게 서류를 보내는 때와 같게:
 *    그 전에는 '모집이 끝나면 보내 드려요'로 보이고, 그 뒤에 확정한 사람은 바로 받음)
 */
export function docsDue(job: Pick<Job, 'status' | 'start_date'>, now = Date.now()): boolean {
  if (job.status !== 'open' && job.status !== 'draft') return true
  if (job.start_date <= kstDate(new Date(now))) return true
  return job.start_date <= kstDate(new Date(now + 86_400_000)) && new Date(now + 9 * 3_600_000).getUTCHours() >= 18
}

/**
 * 모집 중인 공고의 서명 서류가 저절로 가는 때 — 근무 전날 저녁 6시(매일 저녁 알림 작업) · '오늘 저녁 6시' / '내일 저녁 6시' / '11/26(목) 저녁 6시'
 * (정기 개선 2026-11-25: '근무 전날 저녁'보다 날짜를 바로 알게) · 이미 보낼 때면(docsDue) null
 */
export function docsAutoAt(job: Pick<Job, 'status' | 'start_date'>, now = Date.now(), abs = false): string | null {
  if (docsDue(job, now)) return null
  const [y, m, d] = job.start_date.split('-').map(Number)
  const eve = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  // abs: 나중에 다시 읽는 알림 글에는 '오늘·내일' 대신 날짜로
  const day = abs ? fmtDate(eve) : eve === kstDate(new Date(now)) ? '오늘' : eve === kstDate(new Date(now + 86_400_000)) ? '내일' : fmtDate(eve)
  return `${day} 저녁 6시`
}

/** 확정한 사람의 서류: 보낼 때면 지금 만들고, 아니면 모집 마감(또는 근무 전날)에 한 번에 — 새로 서류가 생긴 사람을 돌려줌 */
export async function ensureDocsWhenDue(job: Job, userIds: string[]): Promise<string[]> {
  if (!docsDue(job)) return []
  return ensurePendingDocsMany(job, userIds)
}

/** 이 공고의 확정자 모두에게 서류를 만들고 (이미 있으면 그대로) 새로 생긴 사람을 돌려줌 — 모집 마감·근무 전날 */
export async function issueDocsToApproved(job: Job): Promise<string[]> {
  const rows = await allPages<{ user_id: string }>((a, b) =>
    db().from('applications').select('user_id').eq('job_id', job.id).eq('status', 'approved').order('id').range(a, b),
  )
  return ensurePendingDocsMany(job, rows.map((r) => r.user_id))
}

/**
 * 확정을 되돌리거나 취소했을 때 그 공고의 서류를 정리: 서명 대기는 지우고, 이미 서명한 서류도 무효(void)로.
 * 실제로 일한 기록이 있으면 서명한 서류는 근로 증빙이므로 그대로 둠 (무효 서류도 기록은 남음).
 * 무효로 바꾼 서류 수를 돌려줌
 */
export async function releaseDocs(jobId: string, userId: string): Promise<number> {
  await db().from('signed_docs').delete().eq('job_id', jobId).eq('user_id', userId).eq('status', 'pending')
  const { count: worked } = await db().from('attendance').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('user_id', userId)
  if (worked) return 0
  const { data } = await db().from('signed_docs').update({ status: 'void' }).eq('job_id', jobId).eq('user_id', userId).eq('status', 'signed').select('id')
  return data?.length ?? 0
}

export async function audit(
  actorId: string | null,
  action: string,
  targetUserId: string | null = null,
  detail: string | null = null,
  companyId: string | null = null,
) {
  const { ip } = await clientInfo()
  await db().from('audit_logs').insert({ actor_id: actorId, action, target_user_id: targetUserId, detail, ip, company_id: companyId })
}

/** 근무자가 해야 할 일 수: 서명할 서류 + 근무시간 변경 답 + 담당자가 인정한 연장 확인 (아래 탭 '내 근무' 배지) */
export const todoForWorker = cache(async (userId: string): Promise<number> => {
  const [docs, shifts, ot] = await Promise.all([
    db().from('signed_docs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending'),
    db().from('shift_changes').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending'),
    db().from('attendance').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('ot_status', 'pending').eq('ot_by', 'admin'),
  ])
  return (docs.count ?? 0) + (shifts.count ?? 0) + (ot.count ?? 0)
})

/** 근무자가 아직 안 읽은 담당자 답장 수 (머리글·아래 탭이 같은 요청에서 한 번만 읽도록) */
export const unreadForWorker = cache(async (userId: string): Promise<number> => {
  const [{ count }, rooms] = await Promise.all([
    db().from('messages').select('id', { count: 'exact', head: true }).eq('thread_user_id', userId).eq('from_admin', true).is('read_at', null),
    // 같은 근무 단체방의 안 읽은 메시지도
    workerRoomUnreadTotal(userId).catch(() => 0),
  ])
  return (count ?? 0) + rooms
})

/**
 * 읽었지만 아직 답하지 않은 문의 대화 수 (관리자 문의 목록의 '답장 전'과 같은 기준):
 * 최근 7일 안에 사람이 직접 쓴 마지막 글이 근무자 글이고, 읽었고, 알리기만 하는 글(지각·취소 알림 등)이 아닌 대화.
 * 우리가 자동으로 보낸 안내(확정·정산일·공지 등)는 답장으로 치지 않음 · 근무자 글과 우리 글을 따로 받아 와서
 * 한꺼번에 보낸 안내가 많아도 근무자 문의가 밀려나지 않게
 */
export async function noReplyThreads(companyId: string): Promise<{ n: number; only: string | null }> {
  type M = { thread_user_id: string; from_admin: boolean; read_at: string | null; created_at: string; body: string; job_id: string | null }
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [mine, ours] = await Promise.all(
    [false, true].map((fromAdmin) =>
      db()
        .from('messages')
        .select('thread_user_id, from_admin, read_at, created_at, body, job_id')
        .eq('company_id', companyId)
        .eq('from_admin', fromAdmin)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500)
        .then((r) => (r.data ?? []) as M[]),
    ),
  )
  const last = new Map<string, M>()
  for (const m of [...mine, ...ours]) {
    if (m.created_at < since || isQuietNotice(m)) continue
    const cur = last.get(m.thread_user_id)
    if (!cur || m.created_at > cur.created_at) last.set(m.thread_user_id, m)
  }
  // 급여 문의 뒤에 그 공고 급여를 지급했다고 알렸으면 답한 것으로 (문의 목록과 같은 기준)
  const pays = ours.filter((m) => m.body.startsWith(SIGNAL.paid))
  const wait = [...last.values()].filter((m) => !m.from_admin && !!m.read_at && needsReply(m.body) && !paidAfterAsk(m, pays.filter((p) => p.thread_user_id === m.thread_user_id)))
  // 한 사람뿐이면 홈 할 일에서 목록을 거치지 않고 그 대화로 바로
  return { n: wait.length, only: wait.length === 1 ? wait[0].thread_user_id : null }
}

/**
 * 안 읽은 근무자 문의가 모두 한 사람에게서 왔으면 그 사람 (홈 '새 문의'를 누르면 목록을 거치지 않고 그 대화로 · 탭 한 번 줄임).
 * 여러 사람이거나 너무 많아 다 못 읽었으면 null (목록으로)
 */
export async function soleUnreadThread(companyId: string): Promise<string | null> {
  const LIMIT = 1000
  const { data } = await db().from('messages').select('thread_user_id').eq('company_id', companyId).eq('from_admin', false).is('read_at', null).limit(LIMIT)
  const rows = (data ?? []) as { thread_user_id: string }[]
  const ids = new Set(rows.map((r) => r.thread_user_id))
  return ids.size === 1 && rows.length < LIMIT ? rows[0].thread_user_id : null
}

/** 관리자가 아직 안 읽은 근무자 문의 수 (이 회사로 온 문의만) */
export const unreadForAdmins = cache(async (companyId: string): Promise<number> => {
  const { count } = await db()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('from_admin', false)
    .is('read_at', null)
  return count ?? 0
})

/**
 * 여러 회사를 맡은 관리자: 지금 보는 회사 말고 다른 회사에 온 새(안 읽은) 문의 수.
 * 맡은 회사 목록(adminCompanies) 안에서만, 12곳까지. 새 문의가 있는 회사만 돌려줌
 */
export async function otherCompaniesUnread(companies: { id: string; name: string }[], currentId: string): Promise<{ id: string; name: string; n: number }[]> {
  const others = companies.filter((c) => c.id !== currentId).slice(0, 12)
  if (!others.length) return []
  const counts = await Promise.all(others.map((c) => unreadForAdmins(c.id).catch(() => 0)))
  return others.map((c, i) => ({ id: c.id, name: c.name, n: counts[i] })).filter((c) => c.n > 0)
}

/**
 * 그 회사의 지금 일: 확정을 기다리는 지원자 수(보류 빼고 · 모집·마감 상태이고 아직 안 끝난 공고만 — 대시보드 '확정 대기'와 같은 기준)
 * + 오늘 진행하는 행사 수 · 내일 시작하는 행사 수. 공고는 한 번만 읽음
 */
async function companyNow(
  companyId: string,
  today: string,
  tomorrow: string,
): Promise<{ waiting: number; today: number; tomorrow: number; unsigned: number; pendingKeys: Set<string> }> {
  const jobs = (
    ((await db().from('jobs').select('id, status, start_date, end_date, contract_method').eq('company_id', companyId).in('status', ['open', 'closed']).gte('end_date', today)).data ?? []) as Pick<
      Job,
      'id' | 'status' | 'start_date' | 'end_date' | 'contract_method'
    >[]
  ).filter((j) => (j.status === 'open' || j.status === 'closed') && j.end_date >= today)
  const ids = jobs.map((j) => j.id)
  if (!ids.length) return { waiting: 0, today: 0, tomorrow: 0, unsigned: 0, pendingKeys: new Set() }
  // 오늘 진행하는 앱 서명 공고에서 아직 서명 안 한 사람 (대시보드 '오늘 근무 · 서명 안 함'과 같은 일 · 그 회사 서류만)
  const todaySign = jobs.filter((j) => j.start_date <= today && j.contract_method !== 'paper' && j.contract_method !== 'external').map((j) => j.id)
  const [r, docs] = await Promise.all([
    db().from('applications').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'applied').is('held_at', null).in('job_id', ids),
    todaySign.length
      ? db().from('signed_docs').select('job_id, user_id, status').eq('company_id', companyId).in('job_id', todaySign).eq('status', 'pending').limit(2000)
      : null,
  ])
  const pending = ((docs && !docs.error ? docs.data : []) as { job_id: string; user_id: string; status: string }[]).filter((d) => d.status === 'pending' && todaySign.includes(d.job_id))
  return {
    waiting: r.error ? 0 : (r.count ?? 0),
    today: jobs.filter((j) => j.start_date <= today).length,
    tomorrow: jobs.filter((j) => j.start_date === tomorrow).length,
    unsigned: new Set(pending.map((d) => `${d.job_id}|${d.user_id}`)).size,
    // '서명 없이 근무'에서 같은 사람을 두 번 세지 않게 (진행 중 공고의 서명 대기는 '서명 안 함'에만)
    pendingKeys: new Set(pending.map((d) => `${d.job_id}|${d.user_id}`)),
  }
}

/**
 * 서류 안 보냄: 오늘·내일 근무하는 확정자 가운데 서명 서류(앱 서명)가 아직 하나도 없는 사람 수 — 이 회사 자료만 (company_id).
 * 근로계약서는 모집 마감 후에 가서(사용자 요청 2026-11-24) 마감을 잊으면 근무 직전까지 비어 있을 수 있음.
 * 대시보드 '서류 안 보냄 · 공고' 할 일과 같은 기준 — 여러 회사를 맡은 관리자 홈의 다른 회사 칩에 씀 (정기 개선 2026-11-25 02:35)
 */
export async function noDocsSoon(companyId: string, today: string, tomorrow: string): Promise<number> {
  const jobs = (
    must(
      await db()
        .from('jobs')
        .select('id, status, start_date, end_date, contract_method, required_docs, company_id')
        .eq('company_id', companyId)
        .in('status', ['open', 'closed'])
        .gte('end_date', today)
        .lte('start_date', tomorrow),
    ) as (Pick<Job, 'id' | 'status' | 'start_date' | 'end_date' | 'contract_method' | 'required_docs'> & { company_id: string })[]
  ).filter(
    (j) =>
      j.company_id === companyId &&
      (j.status === 'open' || j.status === 'closed') &&
      j.end_date >= today &&
      j.start_date <= tomorrow &&
      j.contract_method !== 'paper' &&
      j.contract_method !== 'external' &&
      (j.required_docs?.length ?? 0) > 0,
  )
  if (!jobs.length) return 0
  const ids = jobs.map((j) => j.id)
  const [apps, docs] = await Promise.all([
    allByIds<{ job_id: string; user_id: string; available_dates: string[] | null; status: string }>(ids, (part, a, b) =>
      db().from('applications').select('id, job_id, user_id, available_dates, status').eq('company_id', companyId).in('job_id', part).eq('status', 'approved').order('id').range(a, b),
    ),
    allByIds<{ job_id: string; user_id: string; status: string }>(ids, (part, a, b) =>
      db().from('signed_docs').select('id, job_id, user_id, status').eq('company_id', companyId).in('job_id', part).in('status', ['pending', 'signed']).order('id').range(a, b),
    ),
  ])
  const has = new Set(docs.filter((d) => d.status === 'pending' || d.status === 'signed').map((d) => `${d.job_id}|${d.user_id}`))
  const byId = new Map(jobs.map((j) => [j.id, j]))
  const works = (a: { job_id: string; available_dates: string[] | null }, d: string) => {
    const j = byId.get(a.job_id)
    return !!j && j.start_date <= d && j.end_date >= d && (!a.available_dates || a.available_dates.includes(d))
  }
  return new Set(
    apps.filter((a) => a.status === 'approved' && !has.has(`${a.job_id}|${a.user_id}`) && (works(a, today) || works(a, tomorrow))).map((a) => `${a.job_id}|${a.user_id}`),
  ).size
}

/**
 * 일했는데 서명 안 함: 오늘 전 날짜에 출근 기록이 있는데 그 공고 서류가 아직 '서명 대기'인 사람 (최근 30일 근무 · 이 회사 자료만).
 * 근로계약서는 일하기 전에 줘야 해서, 근무가 끝났어도 빨리 받아 두도록 대시보드 '확인할 일'에 (정기 개선 2026-11-23 14:35)
 * 공고·사람마다 하나: 마지막으로 일한 날 · 공고 이름
 */
export async function workedUnsigned(companyId: string, today: string): Promise<{ job_id: string; user_id: string; title: string; last: string }[]> {
  const since = kstDate(new Date(Date.parse(`${today}T12:00:00+09:00`) - 30 * 86_400_000))
  const docs = (
    must(await db().from('signed_docs').select('job_id, user_id, status, company_id').eq('company_id', companyId).eq('status', 'pending').limit(2000)) as {
      job_id: string
      user_id: string
      status: string
      company_id: string
    }[]
  ).filter((d) => d.status === 'pending' && d.company_id === companyId)
  if (!docs.length) return []
  const atts = await allByIds<{ job_id: string; user_id: string; work_date: string; company_id: string }>(
    docs.map((d) => d.job_id),
    (part, a, b) =>
      db()
        .from('attendance')
        .select('job_id, user_id, work_date, company_id')
        .eq('company_id', companyId)
        .in('job_id', part)
        .gte('work_date', since)
        .lt('work_date', today)
        .order('id')
        .range(a, b),
  )
  // 마지막으로 일한 날 (조건을 여기서 한 번 더 — 오늘 근무는 '오늘 근무 · 서명 안 함'이 맡음)
  const last = new Map<string, string>()
  for (const a of atts) {
    if (a.company_id !== companyId || a.work_date >= today || a.work_date < since) continue
    const k = `${a.job_id}|${a.user_id}`
    if ((last.get(k) ?? '') < a.work_date) last.set(k, a.work_date)
  }
  const hit = docs.filter((d) => last.has(`${d.job_id}|${d.user_id}`))
  if (!hit.length) return []
  const jobIds = [...new Set(hit.map((d) => d.job_id))]
  const jobs = await allByIds<{ id: string; title: string; company_id: string }>(jobIds, (part, a, b) =>
    db().from('jobs').select('id, title, company_id').eq('company_id', companyId).in('id', part).order('id').range(a, b),
  )
  const titleOf = new Map(jobs.filter((j) => j.company_id === companyId).map((j) => [j.id, j.title]))
  const seen = new Set<string>()
  return hit.flatMap((d) => {
    const k = `${d.job_id}|${d.user_id}`
    // 다른 회사 공고(제목을 못 읽음)거나 같은 사람 서류가 여러 건이면 한 번만
    if (seen.has(k) || !titleOf.has(d.job_id)) return []
    seen.add(k)
    return [{ job_id: d.job_id, user_id: d.user_id, title: titleOf.get(d.job_id)!, last: last.get(k)! }]
  })
}

/**
 * 끝난 행사(지난 30일)인데 결과를 못 들은 대기 지원자 (공고별 · 이 회사만 · 보류한 사람은 빼고).
 * 끝난 행사는 '확정 대기'에 안 나와 잊기 쉬움 → 대시보드 '확인할 일'·다른 회사 안내에서 알려 줌
 */
export async function lapsedWaiting(companyId: string, today: string): Promise<{ id: string; title: string; n: number }[]> {
  const monthAgo = kstDate(new Date(Date.parse(`${today}T12:00:00+09:00`) - 30 * 86_400_000))
  const r = await db()
    .from('jobs')
    .select('id, title, status, end_date')
    .eq('company_id', companyId)
    .in('status', ['open', 'closed'])
    .lt('end_date', today)
    .gte('end_date', monthAgo)
    .order('end_date', { ascending: false })
    .limit(100)
  // (조건을 여기서 한 번 더 — 받은 줄이 조건과 어긋나도 끝난 행사만)
  const jobs = ((r.error ? [] : r.data) as { id: string; title: string; status: string; end_date: string }[]).filter(
    (j) => (j.status === 'open' || j.status === 'closed') && j.end_date < today && j.end_date >= monthAgo,
  )
  if (!jobs.length) return []
  const w = await db().from('applications').select('job_id').eq('company_id', companyId).in('job_id', jobs.map((j) => j.id)).eq('status', 'applied').is('held_at', null).limit(2000)
  const by = new Map<string, number>()
  for (const a of (w.error ? [] : w.data) as { job_id: string }[]) by.set(a.job_id, (by.get(a.job_id) ?? 0) + 1)
  return jobs.filter((j) => by.has(j.id)).map((j) => ({ id: j.id, title: j.title, n: by.get(j.id)! }))
}

/**
 * 여러 회사를 맡은 관리자: 지금 보는 회사 말고 다른 회사에 쌓인 일 — 새 문의(n) + 확정을 기다리는 지원자(waiting)
 * + 오늘 진행하는 행사(today) · 내일 시작하는 행사(tomorrow) + 끝난 행사인데 결과를 못 들은 대기 지원자(lapsed).
 * 회사는 이 관리자가 속한 곳(companies)만 봄 · 12곳까지 · 아무것도 없으면 뺌 (대시보드 안내·회사 고르기 표시)
 */
export async function otherCompaniesTodo(
  /** role: 그 회사에서 내 역할 — 대표('owner')인 회사만 관리자 가입 신청 수를 셈 (승인은 대표만 할 수 있어서) */
  companies: { id: string; name: string; role?: string }[],
  currentId: string,
  /** 관리자 홈에서만: 약속한 정산일이 오늘이거나 지났는데 지급 전인 근무자 수 · 서명 없이 근무한 사람 수 (메뉴의 회사 바꾸기에서는 묻지 않음 — 화면마다 느려지지 않게) */
  withPay = false,
): Promise<{ id: string; name: string; n: number; waiting: number; today: number; tomorrow: number; unsigned: number; lapsed: number; payLate: number; join: number; worked: number; nodoc: number }[]> {
  const others = companies.filter((c) => c.id !== currentId).slice(0, 12)
  if (!others.length) return []
  const today = kstDate()
  const tomorrow = kstDate(new Date(Date.now() + 86_400_000))
  const rows = await Promise.all(
    others.map(async (c) => {
      const [n, now, lapsed, payLate, join, worked, nodoc] = await Promise.all([
        unreadForAdmins(c.id).catch(() => 0),
        companyNow(c.id, today, tomorrow).catch(() => ({ waiting: 0, today: 0, tomorrow: 0, unsigned: 0, pendingKeys: new Set<string>() })),
        lapsedWaiting(c.id, today).then(
          (l) => l.reduce((t, j) => t + j.n, 0),
          () => 0,
        ),
        withPay
          ? unpaidByJob(c.id, today).then(
              (u) => Object.values(u).reduce((t, j) => t + (j.payday && j.payday <= today ? j.n : 0), 0),
              () => 0,
            )
          : 0,
        // 내가 대표인 다른 회사에 승인을 기다리는 관리자 가입 신청 (지금 보는 회사에서만 보이면 다른 회사 신청은 묻혀서 · 정기 개선 2026-11-23 03:35)
        c.role === 'owner'
          ? db()
              .from('company_join_requests')
              .select('user_id', { count: 'exact', head: true })
              .eq('company_id', c.id)
              .then(
                (r) => (r.error ? 0 : (r.count ?? 0)),
                () => 0,
              )
          : 0,
        // 관리자 홈에서만: 그 회사에서 일했는데(지난 날 출근 기록) 서류 서명이 아직인 사람 — 대시보드 '일했는데 서명 안 함'과 같은 기준 (정기 개선 2026-11-23 16:35)
        withPay ? workedUnsigned(c.id, today).catch(() => []) : [],
        // 관리자 홈에서만: 오늘·내일 근무 확정자 중 서명 서류가 아직 안 간 사람 (그 회사로 바꾸면 '서류 안 보냄 · 공고' 할 일)
        withPay ? noDocsSoon(c.id, today, tomorrow).catch(() => 0) : 0,
      ])
      const { pendingKeys, ...counts } = now
      const workedN = worked.filter((w) => !pendingKeys.has(`${w.job_id}|${w.user_id}`)).length
      return { id: c.id, name: c.name, n, ...counts, lapsed, payLate, join, worked: workedN, nodoc }
    }),
  )
  return rows.filter((c) => c.n > 0 || c.waiting > 0 || c.today > 0 || c.tomorrow > 0 || c.lapsed > 0 || c.payLate > 0 || c.join > 0 || c.worked > 0 || c.nodoc > 0)
}

/**
 * 끝난 행사에서 근무를 마쳤는데 아직 '지급 완료'로 처리하지 않은 근무자 수 (공고별, 이 회사만).
 * 급여 지급을 빠뜨리지 않게 대시보드 '확인할 일'·지난 공고 목록에 표시
 */
export async function unpaidByJob(companyId: string, today: string): Promise<Record<string, { title: string; n: number; payday: string | null }>> {
  // 1000줄이 넘으면 DB가 말없이 잘라서 끝까지 나눠 받음 (지급 안 한 사람이 빠지지 않게)
  const rows = (
    await allPages<{ job_id: string; user_id: string; clock_out: string | null; paid: boolean }>((a, b) =>
      db().from('attendance').select('job_id, user_id, clock_out, paid').eq('company_id', companyId).eq('paid', false).order('id').range(a, b),
    )
  ).filter((r) => !r.paid && r.clock_out)
  const ids = [...new Set(rows.map((r) => r.job_id))]
  if (!ids.length) return {}
  const jobs = must(await db().from('jobs').select('id, title, end_date, status, pay_day').eq('company_id', companyId).in('id', ids)) as Pick<
    Job,
    'id' | 'title' | 'end_date' | 'status' | 'pay_day'
  >[]
  const endedJobs = jobs.filter((j) => j.end_date < today && j.status !== 'cancelled')
  const ended = new Map(endedJobs.map((j) => [j.id, j.title]))
  const users: Record<string, Set<string>> = {}
  for (const r of rows) if (ended.has(r.job_id)) (users[r.job_id] ??= new Set()).add(r.user_id)
  // 근무자에게 약속한 정산일: 마지막으로 알린 '💰 정산 예정일' (우리 회사 문의함) · 알린 적 없으면 공고의 지급일 글자로 짐작
  const told = new Map<string, string>()
  const endedIds = Object.keys(users)
  if (endedIds.length) {
    const notes = await allByIds<{ job_id: string; body: string; created_at: string }>(endedIds, (part, a, b) =>
      db()
        .from('messages')
        .select('id, job_id, body, created_at')
        .eq('company_id', companyId)
        .eq('from_admin', true)
        .in('job_id', part)
        .like('body', `${SIGNAL.payday}%`)
        .order('id')
        .range(a, b),
    ).catch(() => [] as { job_id: string; body: string; created_at: string }[])
    for (const m of notes.filter((x) => x.body.startsWith(SIGNAL.payday)).sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      if (told.has(m.job_id)) continue
      const d = paydayDate(parsePayday(m.body), kstDate(new Date(m.created_at)))
      if (d) told.set(m.job_id, d)
    }
  }
  const byId = new Map(endedJobs.map((j) => [j.id, j]))
  return Object.fromEntries(
    Object.entries(users).map(([id, s]) => {
      const j = byId.get(id)!
      return [id, { title: ended.get(id)!, n: s.size, payday: told.get(id) ?? paydayGuess(j.pay_day, j.end_date)?.date ?? null }]
    }),
  )
}

export type JobWage = { gross: number; net: number; paidNet: number; people: number; incomplete: number }

/** 출퇴근 기록으로 사람별 정산 → 공고 합계 (정산 탭과 같은 계산 · 규칙은 lib/pay 그대로) */
export function wageTotal(job: Job, atts: Attendance[]): JobWage {
  const byUser = new Map<string, Attendance[]>()
  for (const a of atts) if (a.job_id === job.id) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a])
  const out: JobWage = { gross: 0, net: 0, paidNet: 0, people: 0, incomplete: 0 }
  for (const mine of byUser.values()) {
    const s = settle(job, mine.map((a) => calcDay(job, a)))
    const done = mine.filter((a) => a.clock_out)
    out.gross += s.gross
    out.net += s.net
    out.incomplete += s.incomplete
    if (s.gross > 0) out.people++
    if (done.length > 0 && done.every((a) => a.paid)) out.paidNet += s.net
  }
  return out
}

/** 공고 목록용: 이 회사 공고들의 지급총액 (세전) · 실수령 · 지급 완료 금액 */
export async function wageTotals(companyId: string, jobs: Job[]): Promise<Record<string, JobWage>> {
  if (!jobs.length) return {}
  // 1000줄이 넘으면 DB가 말없이 잘라서 끝까지 나눠 받음 (큰 행사의 지급총액이 적게 보이지 않게 · 공고가 많으면 100개씩)
  const raw = await allByIds<Attendance>(
    jobs.map((j) => j.id),
    (ids, a, b) => db().from('attendance').select('*').eq('company_id', companyId).in('job_id', ids).order('id').range(a, b),
  )
  // 주휴수당도 함께 (정산 탭과 같은 금액)
  const atts = await withWeeklyPay(raw, companyId)
  return Object.fromEntries(jobs.map((j) => [j.id, wageTotal(j, atts)]))
}

/**
 * 예정 종료 시각이 지났는데 아직 '근무 중'인 내 기록 (어느 화면에서든 근무 종료를 누르라고 알려 주려고).
 * 없으면 null · 머리글·아래쪽 안내가 같은 요청에서 한 번만 읽도록 cache
 */
export const overdueShiftFor = cache(async (userId: string): Promise<{ endText: string; title: string } | null> => {
  const { data } = await db()
    .from('attendance')
    .select('work_date, clock_out, sched_start, sched_end, job:jobs(title, start_time, end_time)')
    .eq('user_id', userId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
  const a = ((data ?? []) as unknown as (Pick<Attendance, 'work_date' | 'clock_out' | 'sched_start' | 'sched_end'> & { job: Pick<Job, 'title' | 'start_time' | 'end_time'> | null })[]).find((r) => !r.clock_out)
  if (!a?.job) return null
  const shift = shiftOf(a.job, a)
  if (scheduledEnd(shift, a.work_date).getTime() > Date.now()) return null
  return { endText: shift.end_time.slice(0, 5), title: a.job.title }
})

/**
 * 회사가 지원에 답하는 데 보통 걸리는 시간(분) — 최근 90일 확정·미선발된 지원의 중간값.
 * 지원하고 기다리는 근무자에게 '이 회사는 보통 3시간 안에 답해요'로 (회사마다 다름).
 * 관리자가 직접 추가했거나 바로 확정된 것(1분 안)은 빼고, 3건이 안 되면 null (몇 건으로는 믿기 어려워서)
 */
export async function replyMinutes(companyId: string): Promise<number | null> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const rows = ((
    await db()
      .from('applications')
      .select('created_at, decided_at, status')
      .eq('company_id', companyId)
      .in('status', ['approved', 'rejected'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200)
  ).data ?? []) as { created_at: string; decided_at: string | null; status: string }[]
  const mins = rows
    .filter((r) => r.decided_at && (r.status === 'approved' || r.status === 'rejected') && r.created_at >= since)
    .map((r) => (Date.parse(r.decided_at!) - Date.parse(r.created_at)) / 60_000)
    .filter((m) => m >= 1)
    .sort((a, b) => a - b)
  if (mins.length < 3) return null
  const mid = Math.floor(mins.length / 2)
  return mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2
}

/** 120 → '2시간', 30 → '1시간', 2000 → '2일' (넉넉히 올려서) */
export function replySpan(min: number): string {
  if (min <= 60) return '1시간'
  if (min < 24 * 60) return `${Math.ceil(min / 60)}시간`
  return `${Math.ceil(min / (24 * 60))}일`
}
