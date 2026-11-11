'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/data'
import { companyJob } from '@/lib/company'
import { db, must } from '@/lib/db'
import { sendAdminPush, sendPush } from '@/lib/push'
import { markRoomRead, mentionedIn, pinnedReads, roomMembers, roomOpen, roomPinned, roomReads, unreadFor, workerRoom, type RoomJob } from '@/lib/room'
import { canManageCompany, requireAdmin, requireUser } from '@/lib/session'
import { overLimit } from '@/lib/ratelimit'
import { badSticker, plainBody } from '@/lib/stickers'
import { DELETED, DELETED_BY_ADMIN, isDeleted, validMessageId } from '@/lib/deleted'
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
  let job: RoomJob | null = await workerRoom(user.id, jobId)
  // 관리자 계정이 다른 회사에서 근무자로 확정된 방이면 근무자로 씀 (한 계정으로 두 역할) · 맡은 회사 방이면 담당자로
  const asAdmin = user.role === 'admin' && (!job || (await canManageCompany(user, job.company_id)))
  if (asAdmin) {
    const admin = await requireAdmin()
    job = (await companyJob(admin, jobId)) as RoomJob | null
  }
  if (!job) return { error: '이 단체방에 들어갈 수 없어요. (확정된 근무자와 담당자만)' }
  if (!roomOpen(job)) return { error: '행사가 끝나고 7일이 지나 이제 글을 쓸 수 없어요. 대화 저장은 할 수 있어요.' }
  const body = str(form, 'body', 2000)
  if (!body) return { error: '내용을 입력해 주세요.' }
  if (badSticker(body)) return { error: '보낼 수 없는 이모티콘이에요.' }
  if (isDeleted(body)) return { error: '보낼 수 없는 내용이에요.' }
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
    // '@이름'으로 부른 사람에게는 '나를 언급했어요' 알림을 따로 (일반 알림 대신)
    const called = new Set(mentionedIn(body, [...workers, ...admins]).map((p) => p.id).filter((id) => id !== user.id))
    const plain = (list: { id: string }[]) => list.map((p) => p.id).filter((id) => id !== user.id && !called.has(id))
    const mention = { title: `👥 ${title} · ${user.name}님이 나를 언급했어요`, body: plainBody(body) }
    await Promise.all([
      sendPush(plain(workers), { title: `👥 ${title}`, body: text, url: `/me/chat/room/${jobId}`, tag }, { optional: true }),
      // 관리자: 여러 회사를 맡은 사람에게는 제목 끝에 회사 이름 (어느 회사 단체방인지 · 방에 참여한 관리자에게만)
      sendAdminPush(job.company_id, { title: `👥 ${title}`, body: text, url: `/admin/chat/room/${jobId}`, tag }, { optional: true, only: plain(admins) }),
      sendPush(workers.filter((w) => called.has(w.id)).map((w) => w.id), { ...mention, url: `/me/chat/room/${jobId}`, tag: `${tag}-at` }),
      sendAdminPush(job.company_id, { ...mention, url: `/admin/chat/room/${jobId}`, tag: `${tag}-at` }, { only: admins.filter((a) => called.has(a.id)).map((a) => a.id) }),
    ])
  })
  roomPaths(jobId)
  return { ok: pin ? '공지로 고정했어요' : '보냈어요' }
}

/**
 * 단체방 메시지 지우기: 근무자는 내가 쓴 것만, 담당자(이 공고 회사의 관리자)는 방 정리를 위해 누구 글이든.
 * 내용은 남기지 않고 '삭제된 메시지예요'(남의 글을 담당자가 지우면 '담당자가 삭제한 메시지예요')로 보임.
 * 고정된 공지였으면 고정도 풂
 */
export async function deleteRoomMessage(jobId: string, id: number | string): Promise<FormState> {
  const user = await requireUser(`/me/chat/room/${jobId}`)
  if (!isUuid(jobId) || !validMessageId(id)) return { error: '잘못된 요청입니다.' }
  const mineRoom = await workerRoom(user.id, jobId)
  // 다른 회사에서 근무자로 확정된 관리자 계정은 그 방에서 근무자 (자기 글만 지움)
  const asAdmin = user.role === 'admin' && (!mineRoom || (await canManageCompany(user, mineRoom.company_id)))
  const job = asAdmin ? await companyJob(await requireAdmin(), jobId) : mineRoom
  if (!job) return { error: '이 단체방에 들어갈 수 없어요.' }
  const { data } = await db().from('job_chat').select('id, sender_id, body, pinned_at').eq('id', id).eq('job_id', jobId).maybeSingle()
  const m = data as { sender_id: string | null; body: string; pinned_at: string | null } | null
  if (!m) return { error: '메시지를 찾을 수 없어요.' }
  const mine = m.sender_id === user.id
  if (!mine && !asAdmin) return { error: '내가 보낸 메시지만 지울 수 있어요.' }
  if (isDeleted(m.body)) return { ok: '지웠어요' }
  must(await db().from('job_chat').update({ body: mine ? DELETED : DELETED_BY_ADMIN, pinned_at: null }).eq('id', id).eq('job_id', jobId))
  await audit(user.id, mine ? 'room.delete' : 'room.delete_other', mine ? null : m.sender_id, job.title, job.company_id)
  roomPaths(jobId)
  return { ok: '지웠어요' }
}

/**
 * 담당자: 이 메시지를 아직 안 읽은 근무자에게만 다시 휴대폰 알림 (메시지마다 10분에 한 번)
 */
export async function nudgeRoomUnread(jobId: string, id: number | string): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(jobId) || !validMessageId(id)) return { error: '잘못된 요청입니다.' }
  const job = await companyJob(admin, jobId)
  if (!job) return { error: '공고를 찾을 수 없어요.' }
  const { data } = await db().from('job_chat').select('id, sender_id, from_admin, body, created_at').eq('id', id).eq('job_id', jobId).maybeSingle()
  const m = data as { sender_id: string | null; from_admin: boolean; body: string; created_at: string } | null
  if (!m || isDeleted(m.body)) return { error: '메시지를 찾을 수 없어요.' }
  const [members, reads] = await Promise.all([roomMembers(job), roomReads(jobId)])
  const workerIds = new Set(members.workers.map((w) => w.id))
  const unread = unreadFor(m, members, reads, admin.id).filter((u) => workerIds.has(u.id))
  if (!unread.length) return { ok: '근무자는 모두 읽었어요.' }
  if (await overLimit(`room-unread:${jobId}:${id}`, 1, 600)) return { error: '방금 알림을 보냈어요. 10분 뒤에 다시 보낼 수 있어요.' }
  const who = m.from_admin ? '담당자' : (members.workers.find((w) => w.id === m.sender_id)?.name ?? '근무자')
  after(() =>
    sendPush(
      unread.map((u) => u.id),
      { title: `👥 ${job.title} · 안 읽은 메시지`, body: `${who}: ${plainBody(m.body).slice(0, 80)}`, url: `/me/chat/room/${jobId}`, tag: `room-${jobId}` },
    ),
  )
  await audit(admin.id, 'room.unread_nudge', null, `${job.title} · ${unread.length}명`, job.company_id)
  return { ok: `안 읽은 ${unread.length}명에게 알림을 보냈어요.` }
}

/** 관리자: 이 단체방에 참여 (알림·안 읽은 수·@부르기 대상이 됨) — 읽음 표시를 남기는 것으로 참여를 기록 */
export async function joinRoom(jobId: string) {
  const admin = await requireAdmin()
  const job = isUuid(jobId) ? await companyJob(admin, jobId) : null
  if (!job) return
  await db().from('job_chat_reads').upsert({ job_id: jobId, user_id: admin.id, read_at: new Date().toISOString() }, { onConflict: 'job_id,user_id' })
  roomPaths(jobId)
  revalidatePath('/admin/chat')
  redirect(`/admin/chat/room/${jobId}?m=${encodeURIComponent('단체방에 참여했어요. 알림을 받아요.')}`)
}

/** 관리자: 단체방 나가기 (공고를 올린 관리자는 늘 참여) */
export async function leaveRoom(jobId: string) {
  const admin = await requireAdmin()
  const job = isUuid(jobId) ? ((await companyJob(admin, jobId)) as (RoomJob & { created_by?: string | null }) | null) : null
  if (!job) return
  if (job.created_by === admin.id) redirect(`/admin/chat/room/${jobId}?m=${encodeURIComponent('공고를 올린 관리자는 단체방에서 나갈 수 없어요.')}`)
  await db().from('job_chat_reads').delete().eq('job_id', jobId).eq('user_id', admin.id)
  roomPaths(jobId)
  revalidatePath('/admin/chat')
  redirect(`/admin/chat?m=${encodeURIComponent('단체방에서 나왔어요. 알림이 오지 않아요.')}`)
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
