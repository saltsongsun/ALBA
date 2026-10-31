import 'server-only'
import { cache } from 'react'
import { db, must } from './db'
import { clientInfo } from './session'
import type { Application, CompanySettings, Job, Settings } from './types'

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

/** 회사 정보. 직인 이미지(data URL, 수백 KB)는 화면에 그릴 때만 { seal: true }로 함께 읽습니다. */
export async function getSettings(): Promise<CompanySettings>
export async function getSettings(opts: { seal: true }): Promise<Settings>
export async function getSettings(opts?: { seal: true }): Promise<CompanySettings | Settings> {
  const cols = opts?.seal ? `${COMPANY_COLS}, seal_image` : COMPANY_COLS
  const data = must(await db().from('settings').select(cols).eq('id', 1).maybeSingle())
  return (data as Settings | null) ?? DEFAULT_SETTINGS
}

/** 직인이 등록돼 있는지만 (이미지는 읽지 않음) */
export async function hasSeal(): Promise<boolean> {
  const { count } = await db()
    .from('settings')
    .select('id', { count: 'exact', head: true })
    .eq('id', 1)
    .not('seal_image', 'is', null)
  return (count ?? 0) > 0
}

export async function getJob(id: string): Promise<Job | null> {
  const { data } = await db().from('jobs').select('*').eq('id', id).maybeSingle()
  return (data as Job | null) ?? null
}

/** 공고 목록과 지원 상태를 한 번에 읽을 때의 select (공고별 인원은 countApps로 셉니다) */
export const JOB_WITH_APP_STATUS = '*, applications(status)'
export type JobWithAppStatus = Job & { applications: { status: string }[] | null }

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
export async function ensurePendingDocs(job: Job, userId: string) {
  if (!job.required_docs?.length) return
  const templates = must(
    await db().from('doc_templates').select('id, kind, title').in('id', job.required_docs),
  ) as { id: string; kind: string; title: string }[]
  // 근로계약서를 종이·다른 서비스(모두싸인 등)로 받는 공고는 앱 서명에서 뺌
  const need = (job.contract_method ?? 'app') === 'app' ? templates : templates.filter((t) => t.kind !== 'contract')
  if (!need.length) return
  const existing = must(
    await db()
      .from('signed_docs')
      .select('template_id')
      .eq('job_id', job.id)
      .eq('user_id', userId)
      .neq('status', 'void'),
  ) as { template_id: string | null }[]
  const have = new Set(existing.map((e) => e.template_id))
  const missing = need.filter((t) => !have.has(t.id))
  if (!missing.length) return
  must(
    await db()
      .from('signed_docs')
      .insert(missing.map((t) => ({ job_id: job.id, user_id: userId, template_id: t.id, kind: t.kind, title: t.title }))),
  )
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
) {
  const { ip } = await clientInfo()
  await db().from('audit_logs').insert({ actor_id: actorId, action, target_user_id: targetUserId, detail, ip })
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
  const { count } = await db()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_user_id', userId)
    .eq('from_admin', true)
    .is('read_at', null)
  return count ?? 0
})

/** 관리자가 아직 안 읽은 근무자 문의 수 */
export const unreadForAdmins = cache(async (): Promise<number> => {
  const { count } = await db()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('from_admin', false)
    .is('read_at', null)
  return count ?? 0
})
