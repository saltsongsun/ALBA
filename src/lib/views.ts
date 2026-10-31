import 'server-only'
import { db, must } from './db'

/** 마지막으로 본 지 이 시간 안이면 '지금 보는 중' (공고 화면은 30초마다 신호를 보냄) */
export const LIVE_SEC = 75

export type ViewStats = { total: number; members: number; live: number }

/** 공고를 연 사람 기록 (같은 사람은 한 줄, 30분 넘게 지나 다시 열면 방문 수 +1) */
export async function recordView(jobId: string, viewer: string, userId: string | null) {
  const { data } = await db().from('job_views').select('last_seen, visits').eq('job_id', jobId).eq('viewer', viewer).maybeSingle()
  const now = new Date().toISOString()
  if (data) {
    const row = data as { last_seen: string; visits: number }
    const again = Date.now() - Date.parse(row.last_seen) > 30 * 60_000
    await db().from('job_views').update({ last_seen: now, ...(again ? { visits: (row.visits ?? 1) + 1 } : {}) }).eq('job_id', jobId).eq('viewer', viewer)
  } else {
    await db().from('job_views').insert({ job_id: jobId, viewer, user_id: userId, first_seen: now, last_seen: now, visits: 1 })
  }
}

type Row = { job_id: string; viewer: string; user_id: string | null; first_seen: string; last_seen: string; visits: number }

/** 공고별 확인한 인원·가입자·지금 보는 인원 */
export async function viewStats(jobIds: string[]): Promise<Record<string, ViewStats>> {
  const out: Record<string, ViewStats> = {}
  for (const id of jobIds) out[id] = { total: 0, members: 0, live: 0 }
  if (!jobIds.length) return out
  const rows = must(await db().from('job_views').select('job_id, user_id, last_seen').in('job_id', jobIds).limit(20000)) as Pick<Row, 'job_id' | 'user_id' | 'last_seen'>[]
  const liveFrom = Date.now() - LIVE_SEC * 1000
  for (const r of rows) {
    const s = out[r.job_id]
    if (!s) continue
    s.total++
    if (r.user_id) s.members++
    if (Date.parse(r.last_seen) >= liveFrom) s.live++
  }
  return out
}

/** 이 공고를 본 가입자 (최근 본 순) */
export async function memberViewers(jobId: string): Promise<{ user_id: string; last_seen: string; visits: number; live: boolean }[]> {
  const rows = must(
    await db().from('job_views').select('user_id, last_seen, visits').eq('job_id', jobId).not('user_id', 'is', null).order('last_seen', { ascending: false }).limit(300),
  ) as Pick<Row, 'user_id' | 'last_seen' | 'visits'>[]
  const liveFrom = Date.now() - LIVE_SEC * 1000
  return rows
    .filter((r): r is typeof r & { user_id: string } => !!r.user_id)
    .sort((a, b) => b.last_seen.localeCompare(a.last_seen))
    .map((r) => ({ user_id: r.user_id, last_seen: r.last_seen, visits: r.visits ?? 1, live: Date.parse(r.last_seen) >= liveFrom }))
}
