import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { companyJob } from '@/lib/company'
import { workerRoom } from '@/lib/room'
import { adminCompanies, COMPANY_COOKIE, getUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

/**
 * '새로 바뀐 게 있나요?'만 가볍게 알려 주는 값 (문의·단체방 화면이 몇 초마다 물어봄).
 * 예전에는 몇 초마다 화면 전체를 서버에서 다시 그렸는데(조회 10번 넘게), 이제 이 값이 바뀔 때만 다시 그림.
 * 내용은 주지 않고 '마지막으로 바뀐 시각·개수'만 — 권한 확인은 화면과 같게 (본인 문의 · 우리 회사 · 확정된 단체방)
 * s=me-chat (근무자 문의) · s=admin-chat (관리자 문의, 지금 고른 회사) · s=room&id=공고 (단체방)
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const s = url.searchParams.get('s')
  const id = url.searchParams.get('id') ?? ''
  const user = await getUser()
  if (!user) return new Response(null, { status: 401 })
  const no = () => new Response(null, { status: 404 })
  const ok = (v: string) => Response.json({ v }, { headers: { 'Cache-Control': 'no-store' } })

  // 관리자: 지금 고른 회사 (화면의 requireAdmin과 같은 기준, 넘어가지 않고 null)
  const adminCompanyId = async () => {
    if (user.role !== 'admin') return null
    const companies = await adminCompanies(user.id, user.isSuper)
    if (!companies.length) return null
    const want = (await cookies()).get(COMPANY_COOKIE)?.value
    return (companies.find((c) => c.id === want) ?? companies[0]).id
  }
  const latest = async (q: PromiseLike<{ data: unknown }>, key: string) => {
    const { data } = await q
    const row = ((data ?? []) as Record<string, string | null>[])[0]
    return row?.[key] ?? ''
  }

  // 단체방들의 마지막 메시지 시각 (문의 목록에 단체방도 함께 보여서)
  const roomsLast = async (jobIds: string[]) =>
    jobIds.length
      ? latest(db().from('job_chat').select('created_at').in('job_id', jobIds).order('created_at', { ascending: false }).limit(1), 'created_at')
      : ''

  if (s === 'me-chat') {
    if (user.role === 'admin') return no()
    const [last, reads, rooms] = await Promise.all([
      latest(db().from('messages').select('created_at').eq('thread_user_id', user.id).order('created_at', { ascending: false }).limit(1), 'created_at'),
      db().from('messages').select('id', { count: 'exact', head: true }).eq('thread_user_id', user.id).not('read_at', 'is', null),
      db()
        .from('applications')
        .select('job_id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .limit(100)
        .then((r) => roomsLast(((r.data ?? []) as { job_id: string }[]).map((a) => a.job_id))),
    ])
    return ok(`${last}|${reads.count ?? 0}|${rooms}`)
  }

  if (s === 'admin-chat') {
    const companyId = await adminCompanyId()
    if (!companyId) return no()
    const [last, reads, rooms] = await Promise.all([
      latest(db().from('messages').select('created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1), 'created_at'),
      db().from('messages').select('id', { count: 'exact', head: true }).eq('company_id', companyId).not('read_at', 'is', null),
      db()
        .from('jobs')
        .select('id')
        .eq('company_id', companyId)
        .in('status', ['open', 'closed'])
        .limit(200)
        .then((r) => roomsLast(((r.data ?? []) as { id: string }[]).map((j) => j.id))),
    ])
    return ok(`${last}|${reads.count ?? 0}|${rooms}`)
  }

  if (s === 'room') {
    if (!isUuid(id)) return no()
    if (user.role === 'admin') {
      const companyId = await adminCompanyId()
      if (!companyId || !(await companyJob({ companyId }, id))) return no()
    } else if (!(await workerRoom(user.id, id))) return no()
    const [last, pinned, read] = await Promise.all([
      latest(db().from('job_chat').select('created_at').eq('job_id', id).order('created_at', { ascending: false }).limit(1), 'created_at'),
      latest(db().from('job_chat').select('pinned_at').eq('job_id', id).not('pinned_at', 'is', null).order('pinned_at', { ascending: false }).limit(1), 'pinned_at'),
      latest(db().from('job_chat_reads').select('read_at').eq('job_id', id).order('read_at', { ascending: false }).limit(1), 'read_at'),
    ])
    return ok(`${last}|${pinned}|${read}`)
  }
  return no()
}
