'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { audit, getJob, isSupportThread, SUPPORT_NAME } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleSummary } from '@/lib/docs'
import { won } from '@/lib/format'
import { adminIds, sendPush } from '@/lib/push'
import { requireAdmin, requireUser, siteOrigin } from '@/lib/session'
import { isDate, isUuid, str } from '@/lib/validate'
import { signalOf } from '@/lib/signals'
import { badSticker, plainBody } from '@/lib/stickers'
import { companyJob, companyWorkerIds, workerInCompany } from '@/lib/company'
import { DELETED, isDeleted, validMessageId } from '@/lib/deleted'
import type { FormState } from './auth'

const MAX_BODY = 2000
const BURST_LIMIT = 20 // 10분에 이만큼까지 (도배 방지)

/**
 * 근무자 → 담당자 문의. 문의함은 회사마다 따로 (그 회사 관리자만 봄).
 * 공고 화면에서 열었으면 그 공고(와 그 공고의 회사)를 함께 표시
 */
export async function sendInquiry(companyId: string, jobId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/me/chat')
  const body = str(form, 'body', MAX_BODY)
  if (!body) return { error: '내용을 입력해 주세요.' }
  // 앱이 보내는 알림 문구(출근 확인 요청·기록 정정 요청 등)인 척하는 메시지는 막음 (담당자 화면이 진짜 요청으로 처리하지 않게)
  if (signalOf(body)) return { error: '이 문구로 시작하는 메시지는 보낼 수 없어요. 앱의 버튼(늦어요·출근 확인 요청·기록 정정)을 써 주세요.' }
  if (badSticker(body)) return { error: '보낼 수 없는 이모티콘이에요.' }
  if (isDeleted(body)) return { error: '보낼 수 없는 내용이에요.' }
  const since = new Date(Date.now() - 10 * 60_000).toISOString()
  const [{ count }, job, { data: company }] = await Promise.all([
    db()
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_user_id', user.id)
      .eq('from_admin', false)
      .gte('created_at', since),
    jobId && isUuid(jobId) ? getJob(jobId) : null,
    isUuid(companyId) ? db().from('companies').select('id').eq('id', companyId).eq('active', true).maybeSingle() : { data: null },
  ])
  if ((count ?? 0) >= BURST_LIMIT) return { error: '메시지를 너무 많이 보냈어요. 잠시 후 다시 보내 주세요.' }
  // 공고가 있으면 공고의 회사로
  const cid = job?.company_id ?? (company as { id: string } | null)?.id
  if (!cid) return { error: '문의할 회사를 골라 주세요.' }
  must(await db().from('messages').insert({ thread_user_id: user.id, sender_id: user.id, from_admin: false, company_id: cid, job_id: job?.id ?? null, body }))
  after(async () => sendPush(await adminIds(cid), { title: `💬 ${user.name} 문의`, body: plainBody(body), url: `/admin/chat/${user.id}`, tag: `chat-${user.id}` }))
  revalidatePath('/me/chat')
  return { ok: '보냈어요' }
}

/** 관리자 → 근무자 답장 (이 회사 관리자 누구나). 이 회사에 문의했거나 지원한 근무자에게만 */
export async function replyInquiry(userId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(userId)) return { error: '잘못된 요청입니다.' }
  const body = str(form, 'body', MAX_BODY)
  if (!body) return { error: '내용을 입력해 주세요.' }
  const { count: asked } = await db().from('messages').select('id', { count: 'exact', head: true }).eq('company_id', admin.companyId).eq('thread_user_id', userId)
  if (!asked && !(await workerInCompany(admin.companyId, userId))) return { error: '이 회사에 문의하거나 지원한 근무자가 아닙니다.' }
  if (badSticker(body)) return { error: '보낼 수 없는 이모티콘이에요.' }
  if (isDeleted(body)) return { error: '보낼 수 없는 내용이에요.' }
  must(await db().from('messages').insert({ thread_user_id: userId, sender_id: admin.id, from_admin: true, company_id: admin.companyId, body }))
  const from = (await isSupportThread(admin.companyId, userId)) ? SUPPORT_NAME : admin.companyName
  after(() => sendPush([userId], { title: `💬 ${from} 답장`, body: plainBody(body), url: `/me/chat?co=${admin.companyId}`, tag: `chat-${admin.companyId}` }))
  revalidatePath(`/admin/chat/${userId}`)
  revalidatePath('/admin/chat')
  return { ok: '보냈어요' }
}

/**
 * 문의 메시지 지우기: 내가 보낸 것만 (관리자는 지금 고른 회사에서 내가 쓴 답장만).
 * 지우면 내용은 남기지 않고 양쪽 화면에 '삭제된 메시지예요'로 보임 (대화 흐름은 그대로).
 * 앱이 남긴 현장 알림·요청(늦어요·출근 확인·기록 정정 등)은 처리 기록이라 지우지 않음
 */
export async function deleteMessage(id: number | string): Promise<FormState> {
  const user = await requireUser('/me/chat')
  if (!validMessageId(id)) return { error: '잘못된 요청입니다.' }
  const { data } = await db().from('messages').select('id, thread_user_id, sender_id, from_admin, company_id, body').eq('id', id).maybeSingle()
  const m = data as { thread_user_id: string; sender_id: string | null; from_admin: boolean; company_id: string; body: string } | null
  const notMine = { error: '내가 보낸 메시지만 지울 수 있어요.' }
  if (!m || m.sender_id !== user.id) return notMine
  if (user.role === 'admin') {
    const admin = await requireAdmin()
    if (!m.from_admin || m.company_id !== admin.companyId) return notMine
  } else if (m.from_admin || m.thread_user_id !== user.id) return notMine
  if (isDeleted(m.body)) return { ok: '지웠어요' }
  if (signalOf(m.body)) return { error: '앱이 보낸 현장 알림·요청은 처리 기록이라 지울 수 없어요.' }
  must(await db().from('messages').update({ body: DELETED }).eq('id', id).eq('sender_id', user.id))
  await audit(user.id, 'chat.delete', m.thread_user_id, null, m.company_id)
  revalidatePath('/me/chat')
  revalidatePath(`/admin/chat/${m.thread_user_id}`)
  revalidatePath('/admin/chat')
  return { ok: '지웠어요' }
}

/**
 * 공고 확정자에게 한 번에 공지 (각자의 문의함에 담당자 메시지로 들어감 → 근무자 앱 '문의' 탭에 표시)
 * target: all | date:YYYY-MM-DD (그날 근무자) | pos:배치이름
 */
export async function announceToJob(jobId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!(await companyJob(admin, jobId))) return { error: '공고를 찾을 수 없습니다.' }
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
      .insert(to.map((uid) => ({ thread_user_id: uid, sender_id: admin.id, from_admin: true, company_id: admin.companyId, job_id: jobId, body: `📢 공지\n${body}` }))),
  )
  await audit(admin.id, 'job.announce', null, `${jobId} ${target} ${to.length}명`, admin.companyId)
  after(async () => {
    const job = await getJob(jobId)
    await sendPush(to, { title: `📢 공지${job ? ` · ${job.title}` : ''}`, body, url: '/me', tag: `notice-${jobId}` })
  })
  revalidatePath('/admin/chat')
  return { ok: `${to.length}명에게 앱으로 보냈어요` }
}

/** 예전에 일한 근무자들에게 새 공고 모집을 앱으로 알림 (각자 문의함에 공고 링크와 함께, 이미 지원한 사람은 뺌) */
export async function inviteToJob(jobId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return { error: '공고를 찾을 수 없습니다.' }
  // 이 회사에서 일했던(지원했던) 사람에게만
  const mine = new Set(await companyWorkerIds(admin.companyId))
  const ids = [...new Set(form.getAll('uid').map(String).filter(isUuid))].filter((id) => mine.has(id)).slice(0, 300)
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
  must(await db().from('messages').insert(to.map((uid) => ({ thread_user_id: uid, sender_id: admin.id, from_admin: true, company_id: admin.companyId, job_id: job.id, body }))))
  await audit(admin.id, 'job.invite', null, `${jobId} ${to.length}명`, admin.companyId)
  after(() => sendPush(to, { title: '📣 새 모집', body: `${job.title} · ${scheduleSummary(job)}`, url: `/jobs/${job.id}`, tag: `invite-${job.id}` }))
  revalidatePath('/admin/chat')
  return { ok: `${to.length}명에게 앱으로 알렸어요${applied.size ? ` (이미 지원한 ${applied.size}명 제외)` : ''}` }
}
