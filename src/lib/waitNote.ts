import { byIds, db, must } from './db'
import { tellWorkers } from './notify'
import { workOver } from './pay'
import { kstDate } from './time'
import type { Job } from './types'
import { WAIT_HEAD } from './signals'

export { WAIT_HEAD }

/**
 * 지원 결과가 늦어질 때 근무자에게 자동으로 가는 정중한 안내 (사용자 요청 2026-11-17
 * "지원한 후에 결과가 조금 늦으면 '지원해 주셔서 감사합니다 · 일정과 업무를 정리하느라 조금 시간이 필요해요'를
 *  좀 더 정중하게 배려하는 태도로 자동으로 답변하게").
 * · 근무자가 '확정 여부가 궁금해요'라고 물으면: 아직 결과 전이면 그 자리에서 바로 답장 (하루에 한 번)
 * · 묻지 않아도: 지원하고 하루(24시간)가 지나도록 결과가 없으면 저녁 안내 때 한 번 (공고마다 한 번)
 * 관리자 문의함에서는 '자동 안내'로 쳐서, 근무자의 문의는 그대로 '답장 전'으로 남음 (확정을 놓치지 않게)
 */
/** 지원하고 이만큼 지나도 결과가 없으면 묻지 않아도 안내 */
export const WAIT_AFTER_MS = 24 * 3600_000

export function waitNoteText(title: string): string {
  return [
    `${title}에 지원해 주셔서 진심으로 감사드려요.`,
    '일정과 업무를 꼼꼼히 정리하느라 결과를 알려 드리기까지 조금 시간이 더 필요해요.',
    '기다리시게 해서 죄송해요. 정리되는 대로 바로 알려 드릴게요.',
  ].join('\n')
}

type JobLite = Pick<Job, 'id' | 'title' | 'company_id' | 'status' | 'end_date' | 'start_time' | 'end_time'>

/** 아직 지원을 받는 중인 공고인지 (취소·종료·근무가 다 끝난 공고엔 '조금만 기다려 달라'고 하지 않음) */
function stillOpen(j: JobLite, today: string): boolean {
  if (!['open', 'closed'].includes(j.status)) return false
  if (j.end_date < today) return false
  return !(j.end_date === today && workOver(j, today))
}

/** 이 사람·공고에 이 안내를 since 뒤로 보낸 적이 있는지 (첫 줄·시각은 받아 와서 한 번 더 확인) */
async function toldSince(userId: string, jobId: string, since: string): Promise<boolean> {
  const { data } = await db()
    .from('messages')
    .select('body, created_at')
    .eq('thread_user_id', userId)
    .eq('job_id', jobId)
    .eq('from_admin', true)
    .like('body', `${WAIT_HEAD}%`)
    .gte('created_at', since)
    .limit(20)
  return ((data ?? []) as { body: string; created_at: string }[]).some((m) => m.body.startsWith(WAIT_HEAD) && m.created_at >= since)
}

/**
 * 근무자가 '확정 여부가 궁금해요'를 보냈을 때: 이 회사에 결과 전인 지원이 있으면 바로 정중한 답장 (같은 공고엔 하루 한 번).
 * 공고에서 물었으면 그 공고, 아니면 이 회사에서 가장 최근에 지원한 결과 전 공고. 근무자는 앱을 보고 있으므로 휴대폰 알림은 안 보냄
 */
export async function replyWaitNote(userId: string, companyId: string, jobId: string | null): Promise<boolean> {
  const today = kstDate()
  let q = db().from('applications').select('job_id, created_at').eq('user_id', userId).eq('status', 'applied').order('created_at', { ascending: false }).limit(20)
  if (jobId) q = q.eq('job_id', jobId)
  const apps = ((await q).data ?? []) as { job_id: string; created_at: string }[]
  if (!apps.length) return false
  const { data: jobs } = await byIds<JobLite>(
    apps.map((a) => a.job_id),
    (part) => db().from('jobs').select('id, title, company_id, status, end_date, start_time, end_time').in('id', part),
  )
  const byId = new Map(jobs.map((j) => [j.id, j]))
  const job = apps.map((a) => byId.get(a.job_id)).find((j): j is JobLite => !!j && j.company_id === companyId && stillOpen(j, today))
  if (!job) return false
  if (await toldSince(userId, job.id, new Date(Date.now() - 24 * 3600_000).toISOString())) return false
  must(
    await db()
      .from('messages')
      .insert({ thread_user_id: userId, sender_id: null, from_admin: true, company_id: companyId, job_id: job.id, body: `${WAIT_HEAD}\n${waitNoteText(job.title)}` }),
  )
  return true
}

/**
 * 저녁 안내(하루 한 번): 지원하고 하루가 지나도록 결과가 없는 사람에게 정중한 안내 (공고마다 한 번 · 이미 받은 사람은 건너뜀).
 * 근무가 다 끝났거나 취소한 공고는 빼고, 회사 문의함에 남기고 휴대폰 알림도 보냄
 */
export async function sendWaitNotes(now = Date.now()): Promise<number> {
  const today = kstDate(new Date(now))
  const cutoff = new Date(now - WAIT_AFTER_MS).toISOString()
  const apps = (
    must(await db().from('applications').select('user_id, job_id, created_at').eq('status', 'applied').lte('created_at', cutoff).order('created_at').limit(1000)) as {
      user_id: string
      job_id: string
      created_at: string
    }[]
  ).filter((a) => a.created_at <= cutoff)
  if (!apps.length) return 0
  const { data: jobs } = await byIds<JobLite>(
    apps.map((a) => a.job_id),
    (part) => db().from('jobs').select('id, title, company_id, status, end_date, start_time, end_time').in('id', part),
  )
  const open = new Map(jobs.filter((j) => stillOpen(j, today)).map((j) => [j.id, j]))
  const waiting = apps.filter((a) => open.has(a.job_id))
  if (!waiting.length) return 0
  // 이미 이 안내를 받은 사람·공고 (한 번만)
  const { data: told } = await byIds<{ thread_user_id: string; job_id: string; body: string }>(
    [...new Set(waiting.map((a) => a.job_id))],
    (part) => db().from('messages').select('thread_user_id, job_id, body').eq('from_admin', true).in('job_id', part).like('body', `${WAIT_HEAD}%`),
  )
  const done = new Set(told.filter((m) => m.body.startsWith(WAIT_HEAD)).map((m) => `${m.thread_user_id}|${m.job_id}`))
  const byJob = new Map<string, string[]>()
  for (const a of waiting) {
    if (done.has(`${a.user_id}|${a.job_id}`)) continue
    done.add(`${a.user_id}|${a.job_id}`)
    byJob.set(a.job_id, [...(byJob.get(a.job_id) ?? []), a.user_id])
  }
  let sent = 0
  for (const [jobId, to] of byJob) {
    const job = open.get(jobId)!
    sent += await tellWorkers(to, { senderId: null, companyId: job.company_id, jobId, title: WAIT_HEAD, text: waitNoteText(job.title), url: `/jobs/${jobId}`, tag: `wait-${jobId}` })
  }
  return sent
}
