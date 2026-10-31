'use server'

import { revalidatePath } from 'next/cache'
import { audit, getJob } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleSummary } from '@/lib/docs'
import { won } from '@/lib/format'
import { requireAdmin, requireUser, siteOrigin } from '@/lib/session'
import { isDate, isUuid, str } from '@/lib/validate'
import type { FormState } from './auth'

const MAX_BODY = 2000
const BURST_LIMIT = 20 // 10분에 이만큼까지 (도배 방지)

/** 근무자 → 담당자 문의 (공고 화면에서 열었으면 그 공고를 함께 표시) */
export async function sendInquiry(jobId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/me/chat')
  const body = str(form, 'body', MAX_BODY)
  if (!body) return { error: '내용을 입력해 주세요.' }
  const since = new Date(Date.now() - 10 * 60_000).toISOString()
  const [{ count }, job] = await Promise.all([
    db()
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_user_id', user.id)
      .eq('from_admin', false)
      .gte('created_at', since),
    jobId && isUuid(jobId) ? getJob(jobId) : null,
  ])
  if ((count ?? 0) >= BURST_LIMIT) return { error: '메시지를 너무 많이 보냈어요. 잠시 후 다시 보내 주세요.' }
  must(await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, job_id: job?.id ?? null, body }))
  revalidatePath('/me/chat')
  return { ok: '보냈어요' }
}

/** 관리자 → 근무자 답장 (어느 관리자든 답할 수 있음) */
export async function replyInquiry(userId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(userId)) return { error: '잘못된 요청입니다.' }
  const body = str(form, 'body', MAX_BODY)
  if (!body) return { error: '내용을 입력해 주세요.' }
  must(await db().from('messages').insert({ thread_user_id: userId, sender_id: admin.id, from_admin: true, body }))
  revalidatePath(`/admin/chat/${userId}`)
  revalidatePath('/admin/chat')
  return { ok: '보냈어요' }
}

/**
 * 공고 확정자에게 한 번에 공지 (각자의 문의함에 담당자 메시지로 들어감 → 근무자 앱 '문의' 탭에 표시)
 * target: all | date:YYYY-MM-DD (그날 근무자) | pos:배치이름
 */
export async function announceToJob(jobId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(jobId)) return { error: '잘못된 요청입니다.' }
  const body = str(form, 'body', MAX_BODY)
  if (!body) return { error: '공지 내용을 입력해 주세요.' }
  const target = str(form, 'target', 60) || 'all'
  const apps = must(
    await db().from('applications').select('user_id, available_dates, position').eq('job_id', jobId).eq('status', 'approved'),
  ) as { user_id: string; available_dates: string[] | null; position: string | null }[]
  const day = target.startsWith('date:') ? target.slice(5) : null
  const pos = target.startsWith('pos:') ? target.slice(4) : null
  if (day && !isDate(day)) return { error: '잘못된 요청입니다.' }
  const to = [
    ...new Set(
      apps
        .filter((a) => (day ? !a.available_dates || a.available_dates.includes(day) : true))
        .filter((a) => (pos ? (a.position ?? '') === pos : true))
        .map((a) => a.user_id),
    ),
  ]
  if (!to.length) return { error: '보낼 확정자가 없어요.' }
  must(
    await db()
      .from('messages')
      .insert(to.map((uid) => ({ thread_user_id: uid, sender_id: admin.id, from_admin: true, job_id: jobId, body: `📢 공지\n${body}` }))),
  )
  await audit(admin.id, 'job.announce', null, `${jobId} ${target} ${to.length}명`)
  revalidatePath('/admin/chat')
  return { ok: `${to.length}명에게 앱으로 보냈어요` }
}

/** 예전에 일한 근무자들에게 새 공고 모집을 앱으로 알림 (각자 문의함에 공고 링크와 함께, 이미 지원한 사람은 뺌) */
export async function inviteToJob(jobId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const job = isUuid(jobId) ? await getJob(jobId) : null
  if (!job) return { error: '공고를 찾을 수 없습니다.' }
  const ids = [...new Set(form.getAll('uid').map(String).filter(isUuid))].slice(0, 300)
  if (!ids.length) return { error: '알릴 사람을 골라 주세요.' }
  const applied = new Set(
    (must(await db().from('applications').select('user_id').eq('job_id', jobId).in('user_id', ids)) as { user_id: string }[]).map((a) => a.user_id),
  )
  const to = ids.filter((id) => !applied.has(id))
  if (!to.length) return { error: '고른 사람이 모두 이미 지원했어요.' }
  const pay = job.pay_type === 'daily' ? `일급 ${won(job.daily_wage)}` : `시급 ${won(job.hourly_wage)}`
  const body = [
    '📣 새 모집',
    job.title,
    `${scheduleSummary(job)}${job.location_name ? ` · ${job.location_name}` : ''}`,
    pay,
    `지원하기: ${await siteOrigin()}/jobs/${job.id}`,
  ].join('\n')
  must(await db().from('messages').insert(to.map((uid) => ({ thread_user_id: uid, sender_id: admin.id, from_admin: true, job_id: job.id, body }))))
  await audit(admin.id, 'job.invite', null, `${jobId} ${to.length}명`)
  revalidatePath('/admin/chat')
  return { ok: `${to.length}명에게 앱으로 알렸어요${applied.size ? ` (이미 지원한 ${applied.size}명 제외)` : ''}` }
}
