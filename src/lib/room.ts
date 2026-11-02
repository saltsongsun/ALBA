import 'server-only'
import { db } from './db'
import { kstDate } from './time'
import { isUuid } from './validate'
import type { Job } from './types'

/**
 * 같은 근무 단체채팅방 (공고마다 하나): 그 공고에 '확정'된 근무자 + 그 회사 관리자.
 * 근무자끼리는 이름만 보임 (번호는 안 보임). 행사가 끝나고 7일 동안 글을 쓸 수 있고, 그 뒤엔 읽기·내려받기만
 */
export const ROOM_OPEN_DAYS = 7

export type RoomJob = Pick<Job, 'id' | 'title' | 'company_id' | 'start_date' | 'end_date' | 'status'>
export type RoomMessage = { id: number | string; job_id: string; sender_id: string | null; from_admin: boolean; body: string; pinned_at: string | null; created_at: string }

const JOB_COLS = 'id, title, company_id, start_date, end_date, status'

/** 아직 글을 쓸 수 있는 방인지 (행사 끝나고 7일까지) */
export function roomOpen(job: Pick<RoomJob, 'end_date'>): boolean {
  const until = kstDate(new Date(Date.parse(`${job.end_date}T12:00:00+09:00`) + ROOM_OPEN_DAYS * 86_400_000))
  return kstDate() <= until
}

/** 근무자가 들어갈 수 있는 방 (그 공고에 지금 확정된 사람만) */
export async function workerRoom(userId: string, jobId: string): Promise<RoomJob | null> {
  if (!isUuid(jobId)) return null
  const [{ data }, { count }] = await Promise.all([
    db().from('jobs').select(JOB_COLS).eq('id', jobId).maybeSingle(),
    db().from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jobId).eq('user_id', userId).eq('status', 'approved'),
  ])
  const job = data as RoomJob | null
  return job && job.status !== 'draft' && count ? job : null
}

/** 참여자: 확정된 근무자(이름만)와 이 회사 관리자 */
export async function roomMembers(job: Pick<RoomJob, 'id' | 'company_id'>): Promise<{ workers: { id: string; name: string }[]; admins: { id: string; name: string }[] }> {
  const [{ data: apps }, { data: mem }] = await Promise.all([
    db().from('applications').select('user_id').eq('job_id', job.id).eq('status', 'approved'),
    db().from('company_members').select('user_id').eq('company_id', job.company_id),
  ])
  const wIds = [...new Set(((apps ?? []) as { user_id: string }[]).map((a) => a.user_id))]
  const aIds = [...new Set(((mem ?? []) as { user_id: string }[]).map((m) => m.user_id))].filter((id) => !wIds.includes(id))
  const ids = [...wIds, ...aIds]
  const { data: users } = ids.length ? await db().from('users').select('id, name').in('id', ids) : { data: [] }
  const name = new Map(((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]))
  const pick = (list: string[]) => list.filter((id) => name.has(id)).map((id) => ({ id, name: name.get(id)! }))
  return { workers: pick(wIds), admins: pick(aIds) }
}

/** 방의 메시지 (최근 limit개, 오래된 것부터) + 보낸 사람 이름 */
export async function roomMessages(jobId: string, limit = 300): Promise<(RoomMessage & { name: string })[]> {
  const { data } = await db()
    .from('job_chat')
    .select('id, job_id, sender_id, from_admin, body, pinned_at, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = ((data ?? []) as RoomMessage[]).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const ids = [...new Set(rows.map((r) => r.sender_id).filter((x): x is string => !!x))]
  const { data: users } = ids.length ? await db().from('users').select('id, name').in('id', ids) : { data: [] }
  const name = new Map(((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]))
  return rows.map((r) => ({ ...r, name: (r.sender_id && name.get(r.sender_id)) || (r.from_admin ? '담당자' : '근무자') }))
}

/** 이 방을 지금까지 읽음으로 */
export async function markRoomRead(jobId: string, userId: string) {
  await db().from('job_chat_reads').upsert({ job_id: jobId, user_id: userId, read_at: new Date().toISOString() }, { onConflict: 'job_id,user_id' })
}

/** 방마다 안 읽은 수 (내가 보낸 건 빼고) */
export async function roomUnread(userId: string, jobIds: string[]): Promise<Record<string, number>> {
  if (!jobIds.length) return {}
  const [{ data: reads }, { data: msgs }] = await Promise.all([
    db().from('job_chat_reads').select('job_id, read_at').eq('user_id', userId).in('job_id', jobIds),
    db().from('job_chat').select('job_id, sender_id, created_at').in('job_id', jobIds).order('created_at', { ascending: false }).limit(3000),
  ])
  const readAt = new Map(((reads ?? []) as { job_id: string; read_at: string }[]).map((r) => [r.job_id, r.read_at]))
  const out: Record<string, number> = {}
  for (const m of (msgs ?? []) as { job_id: string; sender_id: string | null; created_at: string }[]) {
    if (m.sender_id === userId) continue
    const at = readAt.get(m.job_id)
    if (!at || m.created_at > at) out[m.job_id] = (out[m.job_id] ?? 0) + 1
  }
  return out
}

/** 근무자의 단체방 목록: 확정된 공고 중 끝난 지 30일 안 된 것 */
export async function workerRooms(userId: string): Promise<(RoomJob & { unread: number })[]> {
  const { data: apps } = await db().from('applications').select('job_id').eq('user_id', userId).eq('status', 'approved')
  const ids = [...new Set(((apps ?? []) as { job_id: string }[]).map((a) => a.job_id))]
  if (!ids.length) return []
  const since = kstDate(new Date(Date.now() - 30 * 86_400_000))
  const { data } = await db().from('jobs').select(JOB_COLS).in('id', ids).gte('end_date', since)
  const jobs = ((data ?? []) as RoomJob[]).filter((j) => j.status !== 'draft' && j.end_date >= since).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const unread = await roomUnread(userId, jobs.map((j) => j.id))
  return jobs.map((j) => ({ ...j, unread: unread[j.id] ?? 0 }))
}

/** 관리자의 단체방 목록: 이 회사 공고 중 확정자가 있고 끝난 지 30일 안 된 것 */
export async function adminRooms(companyId: string, userId: string): Promise<(RoomJob & { unread: number; members: number })[]> {
  const since = kstDate(new Date(Date.now() - 30 * 86_400_000))
  const { data } = await db().from('jobs').select(JOB_COLS).eq('company_id', companyId).gte('end_date', since).neq('status', 'draft')
  const jobs = ((data ?? []) as RoomJob[]).filter((j) => j.status !== 'draft' && j.end_date >= since)
  if (!jobs.length) return []
  const { data: apps } = await db().from('applications').select('job_id').in('job_id', jobs.map((j) => j.id)).eq('status', 'approved')
  const members: Record<string, number> = {}
  for (const a of (apps ?? []) as { job_id: string }[]) members[a.job_id] = (members[a.job_id] ?? 0) + 1
  const withPeople = jobs.filter((j) => members[j.id]).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const unread = await roomUnread(userId, withPeople.map((j) => j.id))
  return withPeople.map((j) => ({ ...j, unread: unread[j.id] ?? 0, members: members[j.id] ?? 0 }))
}

/** 고정된 공지 (가장 최근 것 하나) + 보낸 사람 이름 */
export async function roomPinned(jobId: string): Promise<(RoomMessage & { name: string }) | null> {
  const { data } = await db()
    .from('job_chat')
    .select('id, job_id, sender_id, from_admin, body, pinned_at, created_at')
    .eq('job_id', jobId)
    .not('pinned_at', 'is', null)
    .order('pinned_at', { ascending: false })
    .limit(1)
  const m = ((data ?? []) as RoomMessage[]).find((r) => r.pinned_at)
  if (!m) return null
  const { data: u } = m.sender_id ? await db().from('users').select('name').eq('id', m.sender_id).maybeSingle() : { data: null }
  return { ...m, name: (u as { name: string } | null)?.name ?? '담당자' }
}

/** 근무자 단체방 안 읽은 수 합계 (아래 탭 '문의' 숫자) */
export async function workerRoomUnreadTotal(userId: string): Promise<number> {
  const { data: apps } = await db().from('applications').select('job_id').eq('user_id', userId).eq('status', 'approved')
  const ids = [...new Set(((apps ?? []) as { job_id: string }[]).map((a) => a.job_id))]
  if (!ids.length) return 0
  return Object.values(await roomUnread(userId, ids)).reduce((n, x) => n + x, 0)
}

/** 관리자 단체방 안 읽은 수 합계 (이 회사 공고, 끝난 지 30일 안) */
export async function adminRoomUnreadTotal(companyId: string, userId: string): Promise<number> {
  const since = kstDate(new Date(Date.now() - 30 * 86_400_000))
  const { data } = await db().from('jobs').select('id').eq('company_id', companyId).gte('end_date', since)
  const ids = ((data ?? []) as { id: string }[]).map((j) => j.id)
  if (!ids.length) return 0
  return Object.values(await roomUnread(userId, ids)).reduce((n, x) => n + x, 0)
}
