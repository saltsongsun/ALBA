import 'server-only'
import { db } from './db'
import { kstAt, kstDate } from './time'
import { weekStart } from './weekly'
import { shiftFacts } from './xp'
import type { PlayStats } from './playContent'
import { myCheckinDays } from './community2'
import { streakOf } from './communityShared'

/**
 * 놀이터 기록 (배지·이번 주 챌린지): 내 기록만 읽어서 셈 — 저장하지 않음 · 다른 사람 기록은 읽지 않음.
 * 근무 판단은 레벨 카드와 같은 기준 (lib/xp shiftFacts: 정시 = 예정 시작 + 5분 안 · 직접 종료 = 관리자·자동 종료가 아님)
 */
export async function playStats(userId: string): Promise<PlayStats> {
  const today = kstDate()
  const ws = weekStart(today)
  const wsIso = kstAt(ws, '00:00').toISOString()
  const [atts, signed, reviews, posts, comments, linksOut, linksIn, me, checkins] = await Promise.all([
    db()
      .from('attendance')
      .select('job_id, company_id, work_date, clock_in, clock_out, note, source, sched_start')
      .eq('user_id', userId)
      .not('clock_in', 'is', null)
      .order('work_date', { ascending: false })
      .limit(1000)
      .then((r) => (r.data ?? []) as { job_id: string; company_id: string | null; work_date: string; clock_in: string; clock_out: string | null; note: string | null; source: string | null; sched_start: string | null }[]),
    db()
      .from('signed_docs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'signed')
      .then((r) => r.count ?? 0),
    db()
      .from('company_reviews')
      .select('job_id', { count: 'exact', head: true })
      .eq('author_id', userId)
      .then((r) => r.count ?? 0),
    db()
      .from('community_posts')
      .select('id, created_at')
      .eq('author_id', userId)
      .is('hidden_at', null)
      .limit(500)
      .then((r) => (r.data ?? []) as { id: string; created_at: string }[]),
    db()
      .from('community_comments')
      .select('id, created_at')
      .eq('author_id', userId)
      .is('hidden_at', null)
      .limit(1000)
      .then((r) => (r.data ?? []) as { id: string; created_at: string }[]),
    db().from('coworker_links').select('to_id').eq('from_id', userId).limit(1000).then((r) => (r.data ?? []) as { to_id: string }[]),
    db().from('coworker_links').select('from_id').eq('to_id', userId).limit(1000).then((r) => (r.data ?? []) as { from_id: string }[]),
    db()
      .from('users')
      .select('photo_at, bank_account_enc, emergency_phone, address, careers')
      .eq('id', userId)
      .maybeSingle()
      .then((r) => r.data as { photo_at: string | null; bank_account_enc: string | null; emergency_phone: string | null; address: string | null; careers: unknown } | null),
    myCheckinDays(userId),
  ])
  // 예정 시작 시각 (정시 출근 판단): 공고 시작 시각 · 바뀐 근무 시간이 있으면 그것
  const jobIds = [...new Set(atts.map((a) => a.job_id))]
  const starts = new Map<string, string>()
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data } = await db().from('jobs').select('id, start_time').in('id', jobIds.slice(i, i + 200))
    for (const j of (data ?? []) as { id: string; start_time: string }[]) starts.set(j.id, j.start_time)
  }
  const facts = atts.map((a) => {
    const start = a.sched_start ?? starts.get(a.job_id)
    return { ...shiftFacts(a, start ? kstAt(a.work_date, start) : null), date: a.work_date }
  })
  const done = facts.filter((f) => f.done)
  const thisWeek = done.filter((f) => f.date >= ws && f.date <= today)
  // 내 글에 받은 좋아요 (내가 누른 것은 빼고)
  const postIds = posts.map((p) => p.id)
  let likesGot = 0
  for (let i = 0; i < postIds.length; i += 200) {
    const { data } = await db().from('community_likes').select('post_id, user_id').in('post_id', postIds.slice(i, i + 200))
    likesGot += ((data ?? []) as { post_id: string; user_id: string }[]).filter((l) => l.user_id !== userId).length
  }
  const inSet = new Set(linksIn.map((l) => l.from_id))
  return {
    shifts: done.length,
    onTime: done.filter((f) => f.onTime).length,
    selfOut: done.filter((f) => f.selfOut).length,
    companies: new Set(atts.map((a) => a.company_id).filter(Boolean)).size,
    signed,
    reviews,
    posts: posts.length,
    comments: comments.length,
    likesGot,
    coworkers: linksOut.filter((l) => inSet.has(l.to_id)).length,
    streakBest: streakOf(checkins, today).best,
    profileDone: !!(me?.photo_at && me.bank_account_enc && me.emergency_phone && me.address && Array.isArray(me.careers) && me.careers.length > 0),
    week: {
      shifts: thisWeek.length,
      onTime: thisWeek.filter((f) => f.onTime).length,
      talk: posts.filter((p) => p.created_at >= wsIso).length + comments.filter((c) => c.created_at >= wsIso).length,
    },
  }
}
