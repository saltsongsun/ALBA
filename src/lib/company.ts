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
  const ids = (await adminCompanies(user.id, false)).map((c) => c.id)
  if (!ids.length) return false
  const [{ count: apps }, { count: member }] = await Promise.all([
    db().from('applications').select('id', { count: 'exact', head: true }).in('company_id', ids).eq('user_id', workerId),
    db().from('company_members').select('user_id', { count: 'exact', head: true }).in('company_id', ids).eq('user_id', workerId),
  ])
  return (apps ?? 0) > 0 || (member ?? 0) > 0
}
