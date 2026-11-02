import 'server-only'
import { decrypt } from './crypto'
import { getJob, getSettings } from './data'
import { db, must } from './db'
import { calcDay, settle, type DayPay, type Settlement } from './pay'
import { canManageCompany, type SessionUser } from './session'
import type { Attendance, Job, Settings } from './types'
import { isUuid } from './validate'

export type WorkerPay = {
  job: Job
  settings: Settings
  worker: {
    id: string
    name: string
    phone: string
    birth_date: string | null
    address: string | null
    bank_name: string | null
    bank_account: string | null
    account_holder: string | null
  }
  rows: (Attendance & { pay: DayPay })[]
  total: Settlement
}

/** 본인 또는 그 공고 회사의 관리자만 */
export async function loadWorkerPay(viewer: SessionUser, jobId: string, userId: string): Promise<WorkerPay | null> {
  if (!isUuid(jobId) || !isUuid(userId)) return null
  const job = await getJob(jobId)
  if (!job) return null
  if (viewer.id !== userId && !(await canManageCompany(viewer, job.company_id))) return null
  const [settings, { data: worker }, rows] = await Promise.all([
    getSettings(job.company_id, { seal: true }),
    db()
      .from('users')
      .select('id, name, phone, birth_date, address, bank_name, bank_account_enc, account_holder')
      .eq('id', userId)
      .maybeSingle(),
    db()
      .from('attendance')
      .select('*')
      .eq('job_id', jobId)
      .eq('user_id', userId)
      .order('work_date')
      .then((r) => must(r) as Attendance[]),
  ])
  if (!worker) return null
  // 이 공고에 지원했거나 일한 사람만 (관리자: 다른 회원의 주소·계좌가 새지 않게, 근무자 본인: 아무 회사 공고로 그 회사 직인이 찍힌 명세서를 만들지 못하게)
  if (!rows.length) {
    const { count } = await db().from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('user_id', userId)
    if (!count) return null
  }
  const withPay = rows.map((r) => ({ ...r, pay: calcDay(job, r) }))
  return {
    job,
    settings,
    worker: {
      id: worker.id,
      name: worker.name,
      phone: worker.phone,
      birth_date: worker.birth_date,
      address: worker.address,
      bank_name: worker.bank_name,
      bank_account: decrypt(worker.bank_account_enc),
      account_holder: worker.account_holder,
    },
    rows: withPay,
    total: settle(job, withPay.map((r) => r.pay)),
  }
}
