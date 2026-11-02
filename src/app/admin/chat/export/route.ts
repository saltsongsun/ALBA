import { chatText, forbidden, txtDownload } from '@/lib/chatExport'
import { audit } from '@/lib/data'
import { db } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { overLimit } from '@/lib/ratelimit'
import { getUser, requireAdmin } from '@/lib/session'

type Msg = { thread_user_id: string; from_admin: boolean; body: string; created_at: string; sender_id: string | null }
type RoomMsg = { job_id: string; from_admin: boolean; body: string; created_at: string; sender_id: string | null }

/** 관리자: 이 회사의 모든 대화(1:1 문의 + 단체방)를 한 파일로 */
export async function GET() {
  const user = await getUser()
  if (!user || user.role !== 'admin') return forbidden()
  const admin = await requireAdmin()
  // 계정이 털려도 대화를 마구 빼 가지 못하게
  if (await overLimit(`chat-export:${admin.id}`, 20, 3600)) return new Response('내려받기가 너무 잦아요. 한 시간 뒤에 다시 시도해 주세요.', { status: 429 })
  const [{ data: m1 }, { data: m2 }] = await Promise.all([
    db().from('messages').select('thread_user_id, from_admin, body, created_at, sender_id').eq('company_id', admin.companyId).order('created_at').limit(20000),
    db().from('job_chat').select('job_id, from_admin, body, created_at, sender_id').eq('company_id', admin.companyId).order('created_at').limit(20000),
  ])
  const dms = (m1 ?? []) as Msg[]
  const rooms = (m2 ?? []) as RoomMsg[]
  const userIds = [...new Set([...dms.map((m) => m.thread_user_id), ...dms.map((m) => m.sender_id), ...rooms.map((m) => m.sender_id)].filter((x): x is string => !!x))]
  const jobIds = [...new Set(rooms.map((m) => m.job_id))]
  const [{ data: users }, { data: jobs }] = await Promise.all([
    userIds.length ? db().from('users').select('id, name, phone').in('id', userIds) : { data: [] },
    jobIds.length ? db().from('jobs').select('id, title').in('id', jobIds) : { data: [] },
  ])
  const who = new Map(((users ?? []) as { id: string; name: string; phone: string }[]).map((u) => [u.id, u]))
  const title = new Map(((jobs ?? []) as { id: string; title: string }[]).map((j) => [j.id, j.title]))
  const nameOf = (id: string | null, admin: boolean) => `${(id && who.get(id)?.name) || (admin ? '담당자' : '근무자')}${admin ? ' (담당자)' : ''}`

  const parts: string[] = []
  const byThread = new Map<string, Msg[]>()
  for (const m of dms) byThread.set(m.thread_user_id, [...(byThread.get(m.thread_user_id) ?? []), m])
  for (const [uid, list] of byThread) {
    const u = who.get(uid)
    parts.push(
      chatText(
        `1:1 문의 · ${u?.name ?? '근무자'} ${phoneFmt(u?.phone)}`,
        list.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => ({ at: m.created_at, who: nameOf(m.from_admin ? m.sender_id : uid, m.from_admin), body: m.body })),
      ),
    )
  }
  const byRoom = new Map<string, RoomMsg[]>()
  for (const m of rooms) byRoom.set(m.job_id, [...(byRoom.get(m.job_id) ?? []), m])
  for (const [jid, list] of byRoom) {
    parts.push(
      chatText(
        `단체방 · ${title.get(jid) ?? '공고'}`,
        list.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => ({ at: m.created_at, who: nameOf(m.sender_id, m.from_admin), body: m.body })),
      ),
    )
  }
  await audit(admin.id, 'chat.export', null, `1:1 ${byThread.size} · 단체방 ${byRoom.size}`, admin.companyId)
  const text = parts.length ? parts.join('\n========================================\n\n') : '저장할 대화가 없어요.\n'
  return txtDownload(`${admin.companyName}_모든대화`, text)
}
