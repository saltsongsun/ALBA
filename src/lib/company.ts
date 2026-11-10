import 'server-only'
import { db } from './db'
import { getJob } from './data'
import { adminCompanies, type AdminUser, type SessionUser } from './session'
import type { Job } from './types'
import { isUuid } from './validate'

/**
 * 회사별 자료 확인: 관리자는 지금 보고 있는 회사의 자료만 읽고 바꿀 수 있음.
 * (id만 알면 다른 회사 공고·지원·출퇴근·서류를 건드릴 수 있는 일이 없도록 모든 관리자 동작이 거침)
 */

/** 이 회사의 공고 (다른 회사 공고면 null) */
export async function companyJob(admin: Pick<AdminUser, 'companyId'>, jobId: string): Promise<Job | null> {
  if (!isUuid(jobId)) return null
  const job = await getJob(jobId)
  return job && job.company_id === admin.companyId ? job : null
}

/**
 * 지금 보는 회사의 공고가 아닐 때: 내가 맡은 다른 회사의 공고면 그 회사 (알림·공유 링크로 열었을 때 '없는 화면' 대신 회사를 바꿔 열게).
 * 내가 맡지 않은 회사의 공고는 null — 있는지도 알리지 않음
 */
export async function jobInMyOtherCompany(admin: Pick<AdminUser, 'companyId' | 'companies'>, jobId: string): Promise<{ id: string; name: string } | null> {
  if (!isUuid(jobId)) return null
  const job = await getJob(jobId)
  if (!job || job.company_id === admin.companyId) return null
  const mine = admin.companies.find((c) => c.id === job.company_id)
  return mine ? { id: mine.id, name: mine.name } : null
}

/**
 * 회사별 표의 한 행이 지금 보는 회사 것이 아닐 때: 내가 맡은 다른 회사의 것이면 그 회사 (없는 화면 대신 회사를 바꿔 열게).
 * 내가 맡지 않은 회사의 것은 null — 있는지도 알리지 않음
 */
export async function rowInMyOtherCompany(admin: Pick<AdminUser, 'companyId' | 'companies'>, table: string, id: string): Promise<{ id: string; name: string } | null> {
  if (!isUuid(id)) return null
  const { data } = await db().from(table).select('company_id').eq('id', id).maybeSingle()
  const cid = (data as { company_id?: string } | null)?.company_id
  if (!cid || cid === admin.companyId) return null
  const mine = admin.companies.find((c) => c.id === cid)
  return mine ? { id: mine.id, name: mine.name } : null
}

/** 회사별 표의 한 행을 읽되, 이 회사 것이 아니면 null */
export async function companyRow<T extends { company_id: string }>(
  admin: Pick<AdminUser, 'companyId'>,
  table: string,
  id: string | number,
  cols = '*',
): Promise<T | null> {
  if (typeof id === 'string' && !isUuid(id)) return null
  const select = cols === '*' || cols.split(',').map((c) => c.trim()).includes('company_id') ? cols : `${cols}, company_id`
  const { data } = await db().from(table).select(select).eq('id', id).maybeSingle()
  const row = data as T | null
  return row && row.company_id === admin.companyId ? row : null
}

/** 이 회사에 지원한 적이 있는 근무자인지 (근무자 정보는 그 근무자가 지원한 회사만 볼 수 있음) */
export async function workerInCompany(companyId: string, userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false
  const [{ count: apps }, { count: member }] = await Promise.all([
    db().from('applications').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('user_id', userId),
    db().from('company_members').select('user_id', { count: 'exact', head: true }).eq('company_id', companyId).eq('user_id', userId),
  ])
  return (apps ?? 0) > 0 || (member ?? 0) > 0
}

/** 이 회사 근무자들의 id (지원한 적이 있는 사람) */
export async function companyWorkerIds(companyId: string): Promise<string[]> {
  const { data } = await db().from('applications').select('user_id').eq('company_id', companyId)
  return [...new Set(((data ?? []) as { user_id: string }[]).map((a) => a.user_id))]
}

/**
 * 관리자가 이 근무자의 정보(사진 등)를 볼 수 있는지: 관리자가 들어갈 수 있는 회사 중 한 곳에라도 지원한 근무자.
 * 최고 관리자는 모두
 */
export async function adminSeesWorker(user: SessionUser, workerId: string): Promise<boolean> {
  if (user.role !== 'admin' || !isUuid(workerId)) return false
  if (user.isSuper) return true
  const companies = await adminCompanies(user.id, false)
  // 가입한 근무자(알바·전문가)는 모든 회사 공용 → 확인된 회사의 관리자는 얼굴 사진을 볼 수 있음 (목록·지원자 화면).
  // 직접 가입해 아직 확인 전인 회사는 우리 회사에 지원한 사람만
  const { data: target } = await db().from('users').select('role, member_type').eq('id', workerId).maybeSingle()
  if (target && target.role === 'worker' && target.member_type !== 'vendor' && companies.some((c) => c.verified)) return true
  const ids = companies.map((c) => c.id)
  if (!ids.length) return false
  const [{ count: apps }, { count: member }] = await Promise.all([
    db().from('applications').select('id', { count: 'exact', head: true }).in('company_id', ids).eq('user_id', workerId),
    db().from('company_members').select('user_id', { count: 'exact', head: true }).in('company_id', ids).eq('user_id', workerId),
  ])
  return (apps ?? 0) > 0 || (member ?? 0) > 0
}
