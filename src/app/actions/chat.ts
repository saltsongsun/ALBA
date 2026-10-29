'use server'

import { revalidatePath } from 'next/cache'
import { getJob } from '@/lib/data'
import { db, must } from '@/lib/db'
import { requireAdmin, requireUser } from '@/lib/session'
import { isUuid, str } from '@/lib/validate'
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
