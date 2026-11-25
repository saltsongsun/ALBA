import 'server-only'
import { db } from './db'
import { nicknames } from './community'
import { REACTIONS, rankScore, streakOf, type ReactionKey } from './communityShared'
import { kstAt, kstDate } from './time'
import { addDays, weekStart } from './weekly'

/**
 * 커뮤니티 2단계 (사용자 요청 2026-11-21 "커뮤니티 2단계도 진행해줘"): 투표 · 이모지 반응 · 출석 체크 · 주간 랭킹.
 * 표가 아직 없거나 읽지 못해도 화면이 깨지지 않게 모두 빈 값으로 돌려줌
 */

const chunks = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export type PollView = { options: string[]; counts: number[]; total: number; mine: number | null }

/** 글들의 투표 (보기 · 보기마다 표 수 · 내가 고른 보기) */
export async function pollsFor(postIds: string[], viewerId: string): Promise<Map<string, PollView>> {
  const out = new Map<string, PollView>()
  if (!postIds.length) return out
  try {
    for (const ids of chunks(postIds)) {
      const { data, error } = await db().from('community_polls').select('post_id, options').in('post_id', ids)
      if (error) return out
      for (const p of (data ?? []) as { post_id: string; options: string[] }[]) {
        if (ids.includes(p.post_id) && Array.isArray(p.options)) out.set(p.post_id, { options: p.options, counts: p.options.map(() => 0), total: 0, mine: null })
      }
    }
    const withPoll = [...out.keys()]
    for (const ids of chunks(withPoll)) {
      const { data } = await db().from('community_poll_votes').select('post_id, user_id, choice').in('post_id', ids).limit(10000)
      for (const v of (data ?? []) as { post_id: string; user_id: string; choice: number }[]) {
        const p = out.get(v.post_id)
        if (!p || v.choice < 0 || v.choice >= p.options.length) continue
        p.counts[v.choice]++
        p.total++
        if (v.user_id === viewerId) p.mine = v.choice
      }
    }
  } catch {}
  return out
}

export type ReactionView = { counts: Record<ReactionKey, number>; mine: ReactionKey[]; total: number }
const emptyCounts = () => Object.fromEntries(REACTIONS.map((r) => [r.key, 0])) as Record<ReactionKey, number>

/** 글들의 이모지 반응 (반응마다 수 · 내가 누른 반응) */
export async function reactionsFor(postIds: string[], viewerId: string): Promise<Map<string, ReactionView>> {
  const out = new Map<string, ReactionView>()
  try {
    for (const ids of chunks(postIds)) {
      const { data, error } = await db().from('community_reactions').select('post_id, user_id, emoji').in('post_id', ids).limit(10000)
      if (error) return out
      for (const r of (data ?? []) as { post_id: string; user_id: string; emoji: ReactionKey }[]) {
        if (!ids.includes(r.post_id) || !REACTIONS.some((x) => x.key === r.emoji)) continue
        const v = out.get(r.post_id) ?? { counts: emptyCounts(), mine: [], total: 0 }
        v.counts[r.emoji]++
        v.total++
        if (r.user_id === viewerId && !v.mine.includes(r.emoji)) v.mine.push(r.emoji)
        out.set(r.post_id, v)
      }
    }
  } catch {}
  return out
}
export const noReactions = (): ReactionView => ({ counts: emptyCounts(), mine: [], total: 0 })

/** 내 출석 날짜 (최근 1년) */
export async function myCheckinDays(userId: string): Promise<string[]> {
  try {
    const since = addDays(kstDate(), -400)
    const { data, error } = await db().from('community_checkins').select('user_id, day').eq('user_id', userId).gte('day', since).order('day', { ascending: false }).limit(500)
    if (error) return []
    return ((data ?? []) as { user_id: string; day: string }[]).filter((r) => r.user_id === userId).map((r) => String(r.day).slice(0, 10))
  } catch {
    return []
  }
}

/** 출석 카드에 필요한 것: 연속 기록 · 이번 주(월~일) 출석한 날 */
export async function checkinView(userId: string) {
  const today = kstDate()
  const days = await myCheckinDays(userId)
  const ws = weekStart(today)
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const set = new Set(days)
  const s = streakOf(days, today)
  return { date: today, current: s.current, best: s.best, done: s.today, week: week.map((d) => ({ day: d, done: set.has(d), isToday: d === today, future: d > today })) }
}

// 화면으로 가는 줄에는 회원 id를 넣지 않음 (별명 뒤 실제 회원이 화면 데이터로 새지 않게 · 보안 점검 2026-11-25)
export type RankRow = { nick: string; points: number; rank: number; me: boolean }

/**
 * 이번 주 랭킹: '참여하기'를 누른 사람만 · 별명과 점수만.
 * 점수 = 출석한 날 · 마친 근무(출근·종료 기록이 모두 있는 날) · 쓴 글 · 단 댓글 (lib/communityShared rankScore)
 */
export async function weeklyRanking(viewerId: string): Promise<{ joined: boolean; members: number; top: RankRow[]; me: RankRow | null }> {
  const empty = { joined: false, members: 0, top: [], me: null }
  try {
    const { data: mem, error } = await db().from('community_rank_members').select('user_id, created_at').order('created_at').limit(2000)
    if (error) return empty
    const ids = [...new Set(((mem ?? []) as { user_id: string }[]).map((m) => m.user_id))]
    const joined = ids.includes(viewerId)
    if (!ids.length) return { ...empty, joined }
    const today = kstDate()
    const ws = weekStart(today)
    const wsIso = kstAt(ws, '00:00').toISOString()
    const stat = new Map(ids.map((id) => [id, { checkins: 0, shifts: 0, posts: 0, comments: 0 }]))
    for (const part of chunks(ids)) {
      const [ck, att, posts, cms] = await Promise.all([
        db().from('community_checkins').select('user_id, day').in('user_id', part).gte('day', ws).limit(5000),
        db().from('attendance').select('user_id, job_id, work_date, clock_in, clock_out').in('user_id', part).gte('work_date', ws).lte('work_date', today).not('clock_out', 'is', null).limit(5000),
        db().from('community_posts').select('author_id, created_at, hidden_at').in('author_id', part).gte('created_at', wsIso).is('hidden_at', null).limit(5000),
        db().from('community_comments').select('author_id, created_at, hidden_at').in('author_id', part).gte('created_at', wsIso).is('hidden_at', null).limit(5000),
      ])
      for (const r of (ck.data ?? []) as { user_id: string; day: string }[]) {
        const d = String(r.day).slice(0, 10)
        const s = stat.get(r.user_id)
        if (s && d >= ws && d <= today) s.checkins++
      }
      const seen = new Set<string>()
      for (const a of (att.data ?? []) as { user_id: string; job_id: string; work_date: string; clock_in: string | null; clock_out: string | null }[]) {
        const k = `${a.user_id}|${a.job_id}|${a.work_date}`
        if (!a.clock_in || !a.clock_out || a.work_date < ws || a.work_date > today || seen.has(k)) continue
        seen.add(k)
        if (stat.has(a.user_id)) stat.get(a.user_id)!.shifts++
      }
      for (const p of (posts.data ?? []) as { author_id: string; created_at: string; hidden_at: string | null }[]) if (!p.hidden_at && p.created_at >= wsIso && stat.has(p.author_id)) stat.get(p.author_id)!.posts++
      for (const c of (cms.data ?? []) as { author_id: string; created_at: string; hidden_at: string | null }[]) if (!c.hidden_at && c.created_at >= wsIso && stat.has(c.author_id)) stat.get(c.author_id)!.comments++
    }
    // 점수 높은 순 (같은 점수는 먼저 참여한 순) · 같은 점수는 같은 순위 (1, 2, 2, 4)
    const order = new Map(ids.map((id, i) => [id, i]))
    const rows = ids
      .map((id) => ({ userId: id, nick: '병아리', points: rankScore(stat.get(id)!), rank: 0, me: id === viewerId }))
      .sort((a, b) => b.points - a.points || order.get(a.userId)! - order.get(b.userId)!)
    rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1))
    const top = rows.filter((r) => r.points > 0).slice(0, 10)
    const me = rows.find((r) => r.me) ?? null
    // 별명은 화면에 보이는 줄만 (참여한 사람이 많아도 한 번에 묻는 수가 적게)
    const nick = await nicknames([...top, ...(me ? [me] : [])].map((r) => r.userId))
    for (const r of [...top, ...(me ? [me] : [])]) r.nick = nick.get(r.userId) ?? '병아리'
    const out = ({ nick, points, rank, me }: (typeof rows)[number]): RankRow => ({ nick, points, rank, me })
    return { joined, members: ids.length, top: top.map(out), me: me ? out(me) : null }
  } catch {
    return empty
  }
}
