import 'server-only'
import { decrypt } from './crypto'
import { getJob, getSettings } from './data'
import { db, must } from './db'
import { calcDay, settle, type DayPay, type Settlement } from './pay'
import type { SessionUser } from './session'
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

/** 본인 또는 관리자만 */
export async function loadWorkerPay(viewer: SessionUser, jobId: string, userId: string): Promise<WorkerPay | null> {
  if (!isUuid(jobId) || !isUuid(userId)) return null
  if (viewer.id !== userId && viewer.role !== 'admin') return null
  const [job, settings, { data: worker }, rows] = await Promise.all([
    getJob(jobId),
    getSettings({ seal: true }),
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
  if (!job || !worker) return null
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
