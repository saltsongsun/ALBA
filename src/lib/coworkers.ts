import 'server-only'
import { db } from './db'
import { nicknames } from './community'
import { kstDate } from './time'

/**
 * 함께 일한 사람: 같은 공고에서 둘 다 출근 기록이 있는 근무자 (최근 1년).
 * 서로 '동료 맺기'를 하면(양쪽 다 요청) 동료 → 같은 공고에 지원했을 때 서로 보임. 언제나 별명으로만 보임
 */
export type LinkState = 'none' | 'sent' | 'received' | 'linked'
export type Coworker = { id: string; nick: string; together: number; lastTitle: string; lastDate: string; state: LinkState }

type Att = { job_id: string; user_id: string; work_date: string; clock_in: string | null }

const since = () => kstDate(new Date(Date.now() - 365 * 86_400_000))

/** 내가 출근한 공고들 */
async function myWorkedJobs(userId: string): Promise<string[]> {
  const { data } = await db().from('attendance').select('job_id, user_id, work_date, clock_in').eq('user_id', userId).not('clock_in', 'is', null).gte('work_date', since()).limit(1000)
  return [...new Set(((data ?? []) as Att[]).filter((r) => r.user_id === userId && r.clock_in).map((r) => r.job_id))]
}

/** 나와 상대 사이의 동료 맺기 상태 (여러 명 한꺼번에) */
export async function linkStates(userId: string, ids: string[]): Promise<Map<string, LinkState>> {
  const out = new Map<string, LinkState>()
  if (!ids.length) return out
  const [{ data: sent }, { data: got }] = await Promise.all([
    db().from('coworker_links').select('from_id, to_id').eq('from_id', userId).in('to_id', ids),
    db().from('coworker_links').select('from_id, to_id').eq('to_id', userId).in('from_id', ids),
  ])
  const s = new Set(((sent ?? []) as { from_id: string; to_id: string }[]).filter((r) => r.from_id === userId).map((r) => r.to_id))
  const g = new Set(((got ?? []) as { from_id: string; to_id: string }[]).filter((r) => r.to_id === userId).map((r) => r.from_id))
  for (const id of ids) out.set(id, s.has(id) && g.has(id) ? 'linked' : s.has(id) ? 'sent' : g.has(id) ? 'received' : 'none')
  return out
}

/** 함께 일한 사람 목록 (최근에 함께한 순) */
export async function coworkers(userId: string): Promise<Coworker[]> {
  const jobIds = await myWorkedJobs(userId)
  if (!jobIds.length) return []
  const { data } = await db().from('attendance').select('job_id, user_id, work_date, clock_in').in('job_id', jobIds).not('clock_in', 'is', null).neq('user_id', userId).limit(5000)
  const rows = ((data ?? []) as Att[]).filter((r) => r.user_id !== userId && r.clock_in && jobIds.includes(r.job_id))
  const by = new Map<string, { jobs: Set<string>; last: Att }>()
  for (const r of rows) {
    const g = by.get(r.user_id) ?? { jobs: new Set<string>(), last: r }
    g.jobs.add(r.job_id)
    if (r.work_date > g.last.work_date) g.last = r
    by.set(r.user_id, g)
  }
  const ids = [...by.keys()]
  if (!ids.length) return []
  const [nick, states, { data: jobs }, { data: people }] = await Promise.all([
    nicknames(ids),
    linkStates(userId, ids),
    db().from('jobs').select('id, title').in('id', [...new Set([...by.values()].map((g) => g.last.job_id))]),
    // 회사 관리자·외주 업체 계정은 빼고 근무자만
    db().from('users').select('id, role, member_type, active').in('id', ids),
  ])
  const title = new Map(((jobs ?? []) as { id: string; title: string }[]).map((j) => [j.id, j.title]))
  const ok = new Set(((people ?? []) as { id: string; role: string; member_type: string | null; active: boolean }[]).filter((u) => u.role !== 'admin' && u.member_type !== 'vendor' && u.active !== false).map((u) => u.id))
  return ids
    .filter((id) => ok.has(id))
    .map((id) => {
      const g = by.get(id)!
      return { id, nick: nick.get(id) ?? '병아리', together: g.jobs.size, lastTitle: title.get(g.last.job_id) ?? '', lastDate: g.last.work_date, state: states.get(id) ?? 'none' }
    })
    .sort((a, b) => (a.state === 'received' ? -1 : 0) - (b.state === 'received' ? -1 : 0) || b.lastDate.localeCompare(a.lastDate))
}

/** 두 사람이 같은 공고에서 함께 출근한 적이 있는지 (동료 맺기 요청 조건) */
export async function workedTogether(a: string, b: string): Promise<boolean> {
  const jobIds = await myWorkedJobs(a)
  if (!jobIds.length) return false
  const { count } = await db().from('attendance').select('id', { count: 'exact', head: true }).eq('user_id', b).in('job_id', jobIds).not('clock_in', 'is', null)
  return (count ?? 0) > 0
}

/** 이 공고에 지원·확정된 내 동료 (서로 맺은 사람만, 별명). 못 읽으면 빈 목록 */
export async function coworkersOnJob(userId: string, jobId: string): Promise<string[]> {
  try {
    const { data: apps } = await db().from('applications').select('user_id, status, job_id').eq('job_id', jobId).in('status', ['applied', 'approved'])
    const ids = [...new Set(((apps ?? []) as { user_id: string; status: string; job_id: string }[]).filter((a) => a.job_id === jobId && a.user_id !== userId).map((a) => a.user_id))]
    if (!ids.length) return []
    const states = await linkStates(userId, ids)
    const linked = ids.filter((id) => states.get(id) === 'linked')
    if (!linked.length) return []
    const nick = await nicknames(linked)
    return linked.map((id) => nick.get(id) ?? '병아리')
  } catch {
    return []
  }
}

/** 이 사람들 중 서로 동료 맺은 사람 (커뮤니티 글·댓글에 '🤝 동료' 표시). 못 읽으면 빈 집합 */
export async function linkedAmong(userId: string, ids: string[]): Promise<Set<string>> {
  const others = [...new Set(ids.filter((id) => id && id !== userId))]
  if (!others.length) return new Set()
  try {
    const states = await linkStates(userId, others)
    return new Set(others.filter((id) => states.get(id) === 'linked'))
  } catch {
    return new Set()
  }
}

/** 나에게 온 동료 맺기 요청 중 아직 수락 안 한 수 (커뮤니티 '함께 일한 사람' 배지). 못 읽으면 0 */
export async function pendingRequests(userId: string): Promise<number> {
  try {
    const { data } = await db().from('coworker_links').select('from_id, to_id').eq('to_id', userId).limit(200)
    const from = ((data ?? []) as { from_id: string; to_id: string }[]).filter((r) => r.to_id === userId).map((r) => r.from_id)
    if (!from.length) return 0
    const states = await linkStates(userId, from)
    return from.filter((id) => states.get(id) === 'received').length
  } catch {
    return 0
  }
}

/** 서로 동료 맺은 사람들 */
export async function myLinkedIds(userId: string): Promise<string[]> {
  try {
    const [{ data: sent }, { data: got }] = await Promise.all([
      db().from('coworker_links').select('from_id, to_id').eq('from_id', userId).limit(500),
      db().from('coworker_links').select('from_id, to_id').eq('to_id', userId).limit(500),
    ])
    const s = new Set(((sent ?? []) as { from_id: string; to_id: string }[]).filter((r) => r.from_id === userId).map((r) => r.to_id))
    return ((got ?? []) as { from_id: string; to_id: string }[]).filter((r) => r.to_id === userId && s.has(r.from_id)).map((r) => r.from_id)
  } catch {
    return []
  }
}

/** 공고마다 지원·확정된 내 동료 수 (공고 목록 카드 '🤝 동료 N'). 못 읽으면 빈 목록 */
export async function coworkerCounts(userId: string, jobIds: string[]): Promise<Record<string, number>> {
  if (!jobIds.length) return {}
  const pals = await myLinkedIds(userId)
  if (!pals.length) return {}
  try {
    const { data } = await db().from('applications').select('job_id, user_id, status').in('job_id', jobIds).in('user_id', pals).in('status', ['applied', 'approved'])
    const out: Record<string, number> = {}
    for (const a of (data ?? []) as { job_id: string; user_id: string; status: string }[]) {
      if (!pals.includes(a.user_id) || !jobIds.includes(a.job_id) || !['applied', 'approved'].includes(a.status)) continue
      out[a.job_id] = (out[a.job_id] ?? 0) + 1
    }
    return out
  } catch {
    return {}
  }
}

/** 동료가 지원·확정된, 아직 끝나지 않은 모집 공고 (함께 일한 사람 화면) */
export async function jobsWithCoworkers(userId: string): Promise<{ id: string; title: string; start_date: string; end_date: string; nicks: string[] }[]> {
  const pals = await myLinkedIds(userId)
  if (!pals.length) return []
  try {
    const today = kstDate()
    const { data } = await db().from('applications').select('job_id, user_id, status').in('user_id', pals).in('status', ['applied', 'approved']).limit(300)
    const apps = ((data ?? []) as { job_id: string; user_id: string; status: string }[]).filter((a) => pals.includes(a.user_id))
    const ids = [...new Set(apps.map((a) => a.job_id))]
    if (!ids.length) return []
    const [{ data: jobs }, nick] = await Promise.all([
      db().from('jobs').select('id, title, start_date, end_date, status, audience').in('id', ids).gte('end_date', today),
      nicknames(apps.map((a) => a.user_id)),
    ])
    return ((jobs ?? []) as { id: string; title: string; start_date: string; end_date: string; status: string; audience: string }[])
      .filter((j) => j.status === 'open' && j.audience === 'worker' && j.end_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 10)
      .map((j) => ({ id: j.id, title: j.title, start_date: j.start_date, end_date: j.end_date, nicks: [...new Set(apps.filter((a) => a.job_id === j.id).map((a) => nick.get(a.user_id) ?? '병아리'))] }))
  } catch {
    return []
  }
}
