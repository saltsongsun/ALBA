'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/data'
import { companyJob } from '@/lib/company'
import { db, must } from '@/lib/db'
import { sendPush } from '@/lib/push'
import { markRoomRead, pinnedReads, roomMembers, roomOpen, roomPinned, workerRoom, type RoomJob } from '@/lib/room'
import { requireAdmin, requireUser } from '@/lib/session'
import { overLimit } from '@/lib/ratelimit'
import { badSticker, plainBody } from '@/lib/stickers'
import { isUuid, str } from '@/lib/validate'
import type { FormState } from './auth'

const BURST_LIMIT = 20 // 10분에 이만큼 넘게 보내면 잠시 막음 (도배 방지)

const roomPaths = (jobId: string) => {
  revalidatePath(`/me/chat/room/${jobId}`)
  revalidatePath(`/admin/chat/room/${jobId}`)
}

/**
 * 단체방에 보내기. 근무자는 그 공고에 확정된 사람만, 관리자는 지금 보고 있는 회사의 공고만.
 * 관리자는 '공지로 고정'을 켜고 보낼 수 있음. 다른 참여자에게 휴대폰 알림
 */
export async function sendRoom(jobId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(`/me/chat/room/${jobId}`)
  if (!isUuid(jobId)) return { error: '잘못된 요청입니다.' }
  let job: RoomJob | null
  const asAdmin = user.role === 'admin'
  if (asAdmin) {
    const admin = await requireAdmin()
    job = (await companyJob(admin, jobId)) as RoomJob | null
  } else {
    job = await workerRoom(user.id, jobId)
  }
  if (!job) return { error: '이 단체방에 들어갈 수 없어요. (확정된 근무자와 담당자만)' }
  if (!roomOpen(job)) return { error: '행사가 끝나고 7일이 지나 이제 글을 쓸 수 없어요. 대화 저장은 할 수 있어요.' }
  const body = str(form, 'body', 2000)
  if (!body) return { error: '내용을 입력해 주세요.' }
  if (badSticker(body)) return { error: '보낼 수 없는 이모티콘이에요.' }
  const since = new Date(Date.now() - 10 * 60_000).toISOString()
  const { count } = await db().from('job_chat').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('sender_id', user.id).gte('created_at', since)
  if ((count ?? 0) >= BURST_LIMIT) return { error: '메시지를 너무 많이 보냈어요. 잠시 후 다시 보내 주세요.' }
  const pin = asAdmin && form.get('pin') === 'on'
  const now = new Date().toISOString()
  must(
    await db()
      .from('job_chat')
      .insert({ job_id: jobId, company_id: job.company_id, sender_id: user.id, from_admin: asAdmin, body, pinned_at: pin ? now : null }),
  )
  await markRoomRead(jobId, user.id)
  if (pin) await audit(user.id, 'room.pin', null, job.title, job.company_id)
  const title = job.title
  after(async () => {
    const { workers, admins } = await roomMembers(job)
    const text = `${pin ? '📌 공지 · ' : ''}${user.name}: ${plainBody(body)}`
    const tag = `room-${jobId}`
    await Promise.all([
      sendPush(workers.map((w) => w.id).filter((id) => id !== user.id), { title: `👥 ${title}`, body: text, url: `/me/chat/room/${jobId}`, tag }),
      sendPush(admins.map((a) => a.id).filter((id) => id !== user.id), { title: `👥 ${title}`, body: text, url: `/admin/chat/room/${jobId}`, tag }),
    ])
  })
  roomPaths(jobId)
  return { ok: pin ? '공지로 고정했어요' : '보냈어요' }
}

/** 고정된 공지 내리기 (관리자) */
export async function unpinRoom(jobId: string) {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return
  must(await db().from('job_chat').update({ pinned_at: null }).eq('job_id', jobId).not('pinned_at', 'is', null))
  roomPaths(jobId)
}

/** 고정 공지를 아직 안 본 근무자에게만 다시 알림 (관리자, 공고마다 10분에 한 번) */
export async function nudgePinned(jobId: string, _: FormState, _form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const job = await companyJob(admin, jobId)
  if (!job) return { error: '공고를 찾을 수 없어요.' }
  const pinned = await roomPinned(job.id)
  if (!pinned?.pinned_at) return { error: '고정된 공지가 없어요.' }
  const { workers } = await roomMembers(job)
  const { unseen } = await pinnedReads(job.id, pinned.pinned_at, workers)
  if (!unseen.length) return { ok: '모두 공지를 확인했어요.' }
  if (await overLimit(`room-nudge:${job.id}`, 1, 600)) return { error: '방금 알림을 보냈어요. 10분 뒤에 다시 보낼 수 있어요.' }
  after(() =>
    sendPush(
      unseen.map((w) => w.id),
      { title: '📌 단체방 공지를 확인해 주세요', body: `${job.title}: ${plainBody(pinned.body).slice(0, 80)}`, url: `/me/chat/room/${job.id}`, tag: `room-pin-${job.id}` },
    ),
  )
  await audit(admin.id, 'room.pin_nudge', null, `${job.title} · ${unseen.length}명`, job.company_id)
  return { ok: `안 본 ${unseen.length}명에게 알림을 보냈어요.` }
}
