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

export type RoomJob = Pick<Job, 'id' | 'title' | 'company_id' | 'start_date' | 'end_date' | 'status' | 'created_by'>
export type RoomMessage = { id: number | string; job_id: string; sender_id: string | null; from_admin: boolean; body: string; pinned_at: string | null; created_at: string }

const JOB_COLS = 'id, title, company_id, start_date, end_date, status, created_by'

/** 아직 글을 쓸 수 있는 방인지 (행사 끝나고 7일까지) */
export function roomOpen(job: Pick<RoomJob, 'end_date'>): boolean {
  const until = kstDate(new Date(Date.parse(`${job.end_date}T12:00:00+09:00`) + ROOM_OPEN_DAYS * 86_400_000))
  return kstDate() <= until
}

/** 행사가 끝난 방 (대화 목록에서 '종료된 행사'로 따로 모음): 마지막 날이 지났거나 취소·종료된 공고 */
export function roomEnded(job: Pick<RoomJob, 'end_date' | 'status'>): boolean {
  return job.end_date < kstDate() || job.status === 'cancelled' || job.status === 'done'
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

/**
 * 참여자: 확정된 근무자(이름만)와 이 방에 참여한 관리자.
 * 관리자는 모두가 아니라 '공고를 올린 관리자 + 방에 들어온(참여하기·글 쓰기) 관리자'만 — 알림·안 읽은 수·@부르기 대상도 이 사람들
 */
export async function roomMembers(job: Pick<RoomJob, 'id' | 'company_id'> & { created_by?: string | null }): Promise<{ workers: { id: string; name: string }[]; admins: { id: string; name: string }[] }> {
  const [{ data: apps }, { data: mem }, { data: reads }, createdBy] = await Promise.all([
    db().from('applications').select('user_id').eq('job_id', job.id).eq('status', 'approved'),
    db().from('company_members').select('user_id').eq('company_id', job.company_id),
    db().from('job_chat_reads').select('user_id, job_id').eq('job_id', job.id).limit(2000),
    job.created_by !== undefined ? Promise.resolve(job.created_by) : jobCreator(job.id),
  ])
  const joined = new Set(((reads ?? []) as { user_id: string; job_id: string }[]).filter((r) => r.job_id === job.id).map((r) => r.user_id))
  if (createdBy) joined.add(createdBy)
  const wIds = [...new Set(((apps ?? []) as { user_id: string }[]).map((a) => a.user_id))]
  const aIds = [...new Set(((mem ?? []) as { user_id: string }[]).map((m) => m.user_id))].filter((id) => !wIds.includes(id) && joined.has(id))
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

/**
 * 이 방을 지금까지 읽음으로. 새로 온 메시지가 있을 때만 씀 —
 * 화면을 다시 그릴 때마다 쓰면 '바뀐 게 있나요?'(pulse) 값이 계속 바뀌어, 방을 열어 둔 사람끼리 서로 몇 초마다 다시 그리게 됨
 */
export async function markRoomRead(jobId: string, userId: string) {
  const { data: mine } = await db().from('job_chat_reads').select('read_at').eq('job_id', jobId).eq('user_id', userId).maybeSingle()
  const at = (mine as { read_at: string } | null)?.read_at
  if (at) {
    // 내가 읽은 뒤에 온 메시지가 있을 때만 (고정 공지도 새 메시지로 오므로 함께 걸림)
    const { data: newer } = await db().from('job_chat').select('created_at').eq('job_id', jobId).gt('created_at', at).limit(20)
    if (!((newer ?? []) as { created_at: string }[]).some((m) => m.created_at > at)) return
  }
  await db().from('job_chat_reads').upsert({ job_id: jobId, user_id: userId, read_at: new Date().toISOString() }, { onConflict: 'job_id,user_id' })
}

/** 이 방에서 사람마다 마지막으로 읽은 시각 (메시지마다 안 읽은 사람 세기) */
export async function roomReads(jobId: string): Promise<Record<string, string>> {
  const { data } = await db().from('job_chat_reads').select('user_id, read_at, job_id').eq('job_id', jobId).limit(2000)
  return Object.fromEntries(((data ?? []) as { user_id: string; read_at: string; job_id: string }[]).filter((r) => r.job_id === jobId).map((r) => [r.user_id, r.read_at]))
}

/**
 * 메시지를 아직 안 읽은 사람: 확정 근무자 + 방에 한 번이라도 들어온 담당자 중, 보낸 사람·지금 보는 사람 빼고
 * (방을 연 적 없는 다른 관리자까지 세면 숫자가 늘 남아 있어서)
 */
export function unreadFor(
  m: { sender_id: string | null; created_at: string },
  members: { workers: { id: string; name: string }[]; admins: { id: string; name: string }[] },
  reads: Record<string, string>,
  viewerId: string,
): { id: string; name: string }[] {
  const group = [...members.workers, ...members.admins.filter((a) => a.id in reads)]
  return group.filter((u) => u.id !== m.sender_id && u.id !== viewerId && !((reads[u.id] ?? '') >= m.created_at))
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

/** 단체방 마지막 말 (대화 목록 미리보기) */
export type RoomLast = { sender_id: string | null; from_admin: boolean; body: string; created_at: string }

/** 안 읽은 수 + 마지막 말을 한 번에 (대화 목록에서 따로 다시 읽지 않게) */
async function roomStats(userId: string, jobIds: string[]): Promise<{ unread: Record<string, number>; last: Record<string, RoomLast> }> {
  if (!jobIds.length) return { unread: {}, last: {} }
  const [{ data: reads }, { data: msgs }] = await Promise.all([
    db().from('job_chat_reads').select('job_id, read_at').eq('user_id', userId).in('job_id', jobIds),
    db().from('job_chat').select('job_id, sender_id, from_admin, body, created_at').in('job_id', jobIds).order('created_at', { ascending: false }).limit(3000),
  ])
  const readAt = new Map(((reads ?? []) as { job_id: string; read_at: string }[]).map((r) => [r.job_id, r.read_at]))
  const unread: Record<string, number> = {}
  const last: Record<string, RoomLast> = {}
  for (const m of (msgs ?? []) as (RoomLast & { job_id: string })[]) {
    if (!jobIds.includes(m.job_id)) continue
    const prev = last[m.job_id]
    if (!prev || m.created_at > prev.created_at) last[m.job_id] = { sender_id: m.sender_id, from_admin: m.from_admin, body: m.body, created_at: m.created_at }
    if (m.sender_id === userId) continue
    const at = readAt.get(m.job_id)
    if (!at || m.created_at > at) unread[m.job_id] = (unread[m.job_id] ?? 0) + 1
  }
  return { unread, last }
}

/** 근무자의 단체방 목록: 확정된 공고 중 끝난 지 30일 안 된 것 (+ 안 읽은 수 · 마지막 말) */
export async function workerRooms(userId: string): Promise<(RoomJob & { unread: number; last: RoomLast | null })[]> {
  const { data: apps } = await db().from('applications').select('job_id').eq('user_id', userId).eq('status', 'approved')
  const ids = [...new Set(((apps ?? []) as { job_id: string }[]).map((a) => a.job_id))]
  if (!ids.length) return []
  const since = kstDate(new Date(Date.now() - 30 * 86_400_000))
  const { data } = await db().from('jobs').select(JOB_COLS).in('id', ids).gte('end_date', since)
  const jobs = ((data ?? []) as RoomJob[]).filter((j) => j.status !== 'draft' && j.end_date >= since).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const { unread, last } = await roomStats(userId, jobs.map((j) => j.id))
  return jobs.map((j) => ({ ...j, unread: unread[j.id] ?? 0, last: last[j.id] ?? null }))
}

/** 공고를 올린 관리자 (단체방에 자동 참여) */
async function jobCreator(jobId: string): Promise<string | null> {
  const { data } = await db().from('jobs').select('created_by').eq('id', jobId).maybeSingle()
  return (data as { created_by: string | null } | null)?.created_by ?? null
}

/** 이 관리자가 방에 참여했는지: 공고를 올렸거나 방에 들어온(참여하기·글 쓰기) 기록이 있으면 */
export async function adminJoined(job: Pick<RoomJob, 'id'> & { created_by?: string | null }, userId: string): Promise<boolean> {
  if (job.created_by === userId) return true
  const { data } = await db().from('job_chat_reads').select('user_id').eq('job_id', job.id).eq('user_id', userId).maybeSingle()
  return !!data
}

/** 관리자가 참여한 방 id (올린 공고 + 들어온 방) */
async function joinedRoomIds(userId: string, jobs: Pick<RoomJob, 'id' | 'created_by'>[]): Promise<Set<string>> {
  if (!jobs.length) return new Set()
  const { data } = await db().from('job_chat_reads').select('job_id, user_id').eq('user_id', userId).in('job_id', jobs.map((j) => j.id))
  const ids = new Set(((data ?? []) as { job_id: string; user_id: string }[]).filter((r) => r.user_id === userId).map((r) => r.job_id))
  for (const j of jobs) if (j.created_by === userId) ids.add(j.id)
  return ids
}

/**
 * 관리자의 단체방 목록: 이 회사 공고 중 확정자가 있고 끝난 지 30일 안 된 것.
 * joined = 내가 참여한 방 (올린 공고·들어온 방) — 안 읽은 수는 참여한 방만 셈 · last = 마지막 말 (문의 목록 미리보기)
 */
export async function adminRooms(companyId: string, userId: string): Promise<(RoomJob & { unread: number; members: number; joined: boolean; last: RoomLast | null })[]> {
  const since = kstDate(new Date(Date.now() - 30 * 86_400_000))
  const { data } = await db().from('jobs').select(JOB_COLS).eq('company_id', companyId).gte('end_date', since).neq('status', 'draft')
  const jobs = ((data ?? []) as RoomJob[]).filter((j) => j.status !== 'draft' && j.end_date >= since)
  if (!jobs.length) return []
  const { data: apps } = await db().from('applications').select('job_id').in('job_id', jobs.map((j) => j.id)).eq('status', 'approved')
  const members: Record<string, number> = {}
  for (const a of (apps ?? []) as { job_id: string }[]) members[a.job_id] = (members[a.job_id] ?? 0) + 1
  const withPeople = jobs.filter((j) => members[j.id]).sort((a, b) => a.start_date.localeCompare(b.start_date))
  // 안 읽은 수와 마지막 말을 한 번에 (마지막 말은 참여 안 한 방도 보여 줘서 들어갈지 고르기 쉽게)
  const [joined, { unread, last }] = await Promise.all([joinedRoomIds(userId, withPeople), roomStats(userId, withPeople.map((j) => j.id))])
  return withPeople.map((j) => ({ ...j, unread: joined.has(j.id) ? (unread[j.id] ?? 0) : 0, members: members[j.id] ?? 0, joined: joined.has(j.id), last: last[j.id] ?? null }))
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

/** 관리자 단체방 안 읽은 수 합계 (이 회사 공고, 끝난 지 30일 안 · 내가 참여한 방만) */
export async function adminRoomUnreadTotal(companyId: string, userId: string): Promise<number> {
  const since = kstDate(new Date(Date.now() - 30 * 86_400_000))
  const { data } = await db().from('jobs').select('id, created_by').eq('company_id', companyId).gte('end_date', since)
  const jobs = (data ?? []) as Pick<RoomJob, 'id' | 'created_by'>[]
  if (!jobs.length) return 0
  const ids = [...(await joinedRoomIds(userId, jobs))]
  if (!ids.length) return 0
  return Object.values(await roomUnread(userId, ids)).reduce((n, x) => n + x, 0)
}

/** 고정 공지를 근무자 중 누가 봤는지: 공지가 고정된 뒤에 방을 연 사람 = 확인 */
export async function pinnedReads(jobId: string, pinnedAt: string, workers: { id: string; name: string }[]): Promise<{ seen: { id: string; name: string }[]; unseen: { id: string; name: string }[] }> {
  if (!workers.length) return { seen: [], unseen: [] }
  const { data } = await db().from('job_chat_reads').select('user_id, read_at, job_id').eq('job_id', jobId).in('user_id', workers.map((w) => w.id))
  const readAt = new Map(((data ?? []) as { user_id: string; read_at: string; job_id: string }[]).filter((r) => r.job_id === jobId).map((r) => [r.user_id, r.read_at]))
  const seenIt = (id: string) => (readAt.get(id) ?? '') >= pinnedAt
  return { seen: workers.filter((w) => seenIt(w.id)), unseen: workers.filter((w) => !seenIt(w.id)) }
}

/** 메시지에서 '@이름'으로 부른 사람 (이름 뒤는 끝·띄어쓰기·문장부호). 같은 이름이면 모두 */
export function mentionedIn<T extends { name: string }>(body: string, people: T[]): T[] {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 앞은 처음·띄어쓰기·여는 괄호 (메일 주소 속 @는 빼려고)
  return people.filter((p) => p.name.trim() && new RegExp(`(^|[\\s(\\[])@${esc(p.name.trim())}(?=$|[\\s.,!?~)\\]])`).test(body))
}
