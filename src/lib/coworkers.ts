import 'server-only'
import { cache } from 'react'
import { db } from './db'
import { nicknames } from './community'
import { kstDate } from './time'

/**
 * 함께 일한 사람: 같은 공고에서 둘 다 출근 기록이 있는 근무자 (최근 1년). 언제나 별명으로만 보임.
 * 한쪽으로만 보여 주기 (사용자 요청 2026-11-06 "스토킹 같은 걸로 이어질 수 있으니 내 지원 정보를 지정된 사람에게만 공개 · 남의 정보를 내가 아는 건 아님"):
 * coworker_links 한 줄(from → to) = 'from이 자기 지원 공고를 to에게 보여 줌'. 상대의 지원은 상대가 나를 골랐을 때만 보임 (요청·수락·알림 없음)
 */
export type Share = { mine: boolean; theirs: boolean }
export type Coworker = { id: string; nick: string; together: number; lastTitle: string; lastDate: string; mine: boolean; theirs: boolean }

type Att = { job_id: string; user_id: string; work_date: string; clock_in: string | null }

const since = () => kstDate(new Date(Date.now() - 365 * 86_400_000))

/**
 * 운영자 전체 스위치 (사용자 요청 2026-11-06 "동료맺기 기능은 켜고 끄게 해줘" · 운영자가 전체로 · 처음엔 꺼짐).
 * 최상위 관리자가 커뮤니티 관리에서 켜고 끈 기록(audit_logs 'feature.coworkers')의 마지막 값. 기록이 없거나 못 읽으면 꺼짐.
 * 꺼져 있으면 메뉴가 숨고 아무에게도 다른 사람의 지원이 보이지 않음 (이미 고른 기록은 남아 있다가 다시 켜면 이어짐)
 */
export const coworkersEnabled = cache(async (): Promise<boolean> => {
  try {
    const { data } = await db().from('audit_logs').select('detail, created_at').eq('action', 'feature.coworkers').order('created_at', { ascending: false }).limit(100)
    const last = ((data ?? []) as { detail: string | null; created_at: string }[]).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    return last?.detail === 'on'
  } catch {
    return false
  }
})

/** 내가 출근한 공고들 */
async function myWorkedJobs(userId: string): Promise<string[]> {
  const { data } = await db().from('attendance').select('job_id, user_id, work_date, clock_in').eq('user_id', userId).not('clock_in', 'is', null).gte('work_date', since()).limit(1000)
  return [...new Set(((data ?? []) as Att[]).filter((r) => r.user_id === userId && r.clock_in).map((r) => r.job_id))]
}

/** 나 ↔ 상대 보여 주기 상태: mine = 내가 상대에게 보여 줌, theirs = 상대가 나에게 보여 줌 (여러 명 한꺼번에) */
export async function shareStates(userId: string, ids: string[]): Promise<Map<string, Share>> {
  const out = new Map<string, Share>()
  if (!ids.length) return out
  const [{ data: sent }, { data: got }] = await Promise.all([
    db().from('coworker_links').select('from_id, to_id').eq('from_id', userId).in('to_id', ids),
    db().from('coworker_links').select('from_id, to_id').eq('to_id', userId).in('from_id', ids),
  ])
  const s = new Set(((sent ?? []) as { from_id: string; to_id: string }[]).filter((r) => r.from_id === userId).map((r) => r.to_id))
  const g = new Set(((got ?? []) as { from_id: string; to_id: string }[]).filter((r) => r.to_id === userId).map((r) => r.from_id))
  for (const id of ids) out.set(id, { mine: s.has(id), theirs: g.has(id) })
  return out
}

/** 함께 일한 사람 목록 (최근에 함께한 순) */
export async function coworkers(userId: string): Promise<Coworker[]> {
  if (!(await coworkersEnabled())) return []
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
    shareStates(userId, ids),
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
      const st = states.get(id) ?? { mine: false, theirs: false }
      return { id, nick: nick.get(id) ?? '병아리', together: g.jobs.size, lastTitle: title.get(g.last.job_id) ?? '', lastDate: g.last.work_date, mine: st.mine, theirs: st.theirs }
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
}

/** 두 사람이 같은 공고에서 함께 출근한 적이 있는지 (보여 줄 수 있는 사람 조건) */
export async function workedTogether(a: string, b: string): Promise<boolean> {
  const jobIds = await myWorkedJobs(a)
  if (!jobIds.length) return false
  const { count } = await db().from('attendance').select('id', { count: 'exact', head: true }).eq('user_id', b).in('job_id', jobIds).not('clock_in', 'is', null)
  return (count ?? 0) > 0
}

/** 이 공고에 지원·확정된 사람 중 나에게 지원 공고를 보여 주기로 한 사람 (별명). 못 읽으면 빈 목록 */
export async function coworkersOnJob(userId: string, jobId: string): Promise<string[]> {
  if (!(await coworkersEnabled())) return []
  try {
    const { data: apps } = await db().from('applications').select('user_id, status, job_id').eq('job_id', jobId).in('status', ['applied', 'approved'])
    const ids = [...new Set(((apps ?? []) as { user_id: string; status: string; job_id: string }[]).filter((a) => a.job_id === jobId && a.user_id !== userId).map((a) => a.user_id))]
    if (!ids.length) return []
    const states = await shareStates(userId, ids)
    const linked = ids.filter((id) => states.get(id)?.theirs)
    if (!linked.length) return []
    const nick = await nicknames(linked)
    return linked.map((id) => nick.get(id) ?? '병아리')
  } catch {
    return []
  }
}

/** 이 사람들 중 나에게 지원 공고를 보여 주는 사람 (커뮤니티 글·댓글에 '🤝 동료' 표시 · 상대가 고른 경우만). 못 읽으면 빈 집합 */
export async function linkedAmong(userId: string, ids: string[]): Promise<Set<string>> {
  const others = [...new Set(ids.filter((id) => id && id !== userId))]
  if (!others.length || !(await coworkersEnabled())) return new Set()
  try {
    const states = await shareStates(userId, others)
    return new Set(others.filter((id) => states.get(id)?.theirs))
  } catch {
    return new Set()
  }
}

/** 나에게 지원 공고를 보여 주는 사람들 (상대가 나를 고른 경우만 · 내가 고른 것과 무관) */
export async function myLinkedIds(userId: string): Promise<string[]> {
  if (!(await coworkersEnabled())) return []
  try {
    const { data: got } = await db().from('coworker_links').select('from_id, to_id').eq('to_id', userId).limit(500)
    return [...new Set(((got ?? []) as { from_id: string; to_id: string }[]).filter((r) => r.to_id === userId).map((r) => r.from_id))]
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
