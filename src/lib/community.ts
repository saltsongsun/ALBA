import 'server-only'
import { randomInt } from 'node:crypto'
import { db, must } from './db'

/**
 * 커뮤니티: 근무자 게시판(자유·꿀팁·질문) + 회사·행사 후기.
 * 가입한 회원 모두 보고, 쓰기는 근무자·전문가만(회사 관리자·외주 업체는 읽기만). 글쓴이는 실명 대신 별명.
 * 신고가 3번 쌓이면 자동으로 가려지고, 최고 관리자가 확인해 다시 보이거나 그대로 둠
 */
export const CATEGORIES = [
  { id: 'free', label: '자유', icon: '💬' },
  { id: 'tip', label: '꿀팁', icon: '🍯' },
  { id: 'question', label: '질문', icon: '🙋' },
] as const
export type Category = (typeof CATEGORIES)[number]['id']
export const isCategory = (v: unknown): v is Category => CATEGORIES.some((c) => c.id === v)
export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]

/** 신고가 이만큼 쌓이면 자동으로 가림 */
export const AUTO_HIDE_REPORTS = 3

export type PostRow = { id: string; author_id: string; category: Category; title: string; body: string; hidden_at: string | null; created_at: string; updated_at: string }
export type CommentRow = { id: string; post_id: string; author_id: string; body: string; hidden_at: string | null; created_at: string }
export type ReviewRow = { id: string; company_id: string; job_id: string; author_id: string; rating: number; body: string; hidden_at: string | null; created_at: string; updated_at: string }

/** 별명 규칙: 2~12자 한글·영문·숫자 (운영자처럼 보이는 이름은 안 됨) */
export function nicknameError(v: string): string | null {
  if (!/^[가-힣a-zA-Z0-9]{2,12}$/.test(v)) return '별명은 한글·영문·숫자 2~12자로 써 주세요.'
  if (/운영|관리자|해피워크|어드민|admin|staff|공식/i.test(v)) return '운영자로 오해할 수 있는 별명은 쓸 수 없어요.'
  return null
}

/** 별명 (없으면 '병아리1234'처럼 하나 만들어 저장) */
export async function ensureNickname(userId: string): Promise<string> {
  const { data } = await db().from('users').select('nickname').eq('id', userId).maybeSingle()
  const cur = (data as { nickname: string | null } | null)?.nickname
  if (cur) return cur
  for (let i = 0; i < 6; i++) {
    const nick = `병아리${randomInt(1000, 100000)}`
    const { data: taken } = await db().from('users').select('id').eq('nickname', nick).maybeSingle()
    if (taken) continue
    const { error } = await db().from('users').update({ nickname: nick }).eq('id', userId).is('nickname', null)
    if (!error) {
      const { data: again } = await db().from('users').select('nickname').eq('id', userId).maybeSingle()
      return (again as { nickname: string | null } | null)?.nickname ?? nick
    }
  }
  return '병아리'
}

/** 여러 사람의 별명 (별명이 아직 없으면 '병아리'로만 보임, 실명은 절대 내보내지 않음) */
export async function nicknames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids)]
  if (!uniq.length) return new Map()
  const rows = must(await db().from('users').select('id, nickname').in('id', uniq)) as { id: string; nickname: string | null }[]
  return new Map(rows.map((r) => [r.id, r.nickname || '병아리']))
}

export type PostCard = PostRow & { nick: string; likes: number; comments: number; liked: boolean }

/** 글 목록 (가려진 글 빼고 최근 순) */
/** 인기 점수: 좋아요·댓글이 많을수록, 최근일수록 높음 (2주 지나면 빠짐) */
function hotScore(p: PostCard, now = Date.now()) {
  const hours = (now - Date.parse(p.created_at)) / 3_600_000
  return (p.likes * 2 + p.comments * 3 + 1) / Math.pow(hours + 2, 0.8)
}

/** 🔥 인기 글: 최근 2주 글 중 좋아요·댓글이 있는 것, 점수 높은 순 */
export async function hotPosts(viewerId: string, limit = 20): Promise<PostCard[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const rows = (must(await db().from('community_posts').select('id, author_id, category, title, body, hidden_at, created_at, updated_at').is('hidden_at', null).gte('created_at', since).order('created_at', { ascending: false }).limit(200)) as PostRow[]).filter(
    (p) => !p.hidden_at && p.created_at >= since,
  )
  const cards = await decorate(rows, viewerId)
  return cards
    .filter((p) => p.likes + p.comments > 0)
    .sort((a, b) => hotScore(b) - hotScore(a))
    .slice(0, limit)
}

export async function listPosts(opts: { category?: Category | null; viewerId: string; limit?: number; q?: string; mine?: boolean }): Promise<PostCard[]> {
  let q = db().from('community_posts').select('id, author_id, category, title, body, hidden_at, created_at, updated_at').is('hidden_at', null)
  if (opts.category) q = q.eq('category', opts.category)
  if (opts.mine) q = q.eq('author_id', opts.viewerId)
  // 검색어가 있으면 최근 글을 더 많이 읽어 제목·내용에서 찾음 (띄어쓰기 무시)
  const words = (opts.q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)
  const posts = (must(await q.order('created_at', { ascending: false }).limit(words.length ? 300 : (opts.limit ?? 50))) as PostRow[])
    .filter((p) => !p.hidden_at && (!opts.category || p.category === opts.category) && (!opts.mine || p.author_id === opts.viewerId))
    .filter((p) => words.every((w) => `${p.title} ${p.body}`.toLowerCase().replace(/\s+/g, '').includes(w)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, opts.limit ?? 50)
  return decorate(posts, opts.viewerId)
}

/** 같은 말머리의 다른 최근 글 (글 아래 '다른 글') */
export async function relatedPosts(post: Pick<PostRow, 'id' | 'category'>, viewerId: string, limit = 3): Promise<PostCard[]> {
  const rows = (must(await db().from('community_posts').select('id, author_id, category, title, body, hidden_at, created_at, updated_at').eq('category', post.category).is('hidden_at', null).order('created_at', { ascending: false }).limit(limit + 1)) as PostRow[])
    .filter((p) => p.id !== post.id && !p.hidden_at && p.category === post.category)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
  return decorate(rows, viewerId)
}

async function decorate(posts: PostRow[], viewerId: string): Promise<PostCard[]> {
  if (!posts.length) return []
  const ids = posts.map((p) => p.id)
  const [likes, comments, nick] = await Promise.all([
    db().from('community_likes').select('post_id, user_id').in('post_id', ids).then((r) => must(r) as { post_id: string; user_id: string }[]),
    db().from('community_comments').select('post_id, hidden_at').in('post_id', ids).then((r) => must(r) as { post_id: string; hidden_at: string | null }[]),
    nicknames(posts.map((p) => p.author_id)),
  ])
  return posts.map((p) => ({
    ...p,
    nick: nick.get(p.author_id) ?? '병아리',
    likes: likes.filter((l) => l.post_id === p.id).length,
    liked: likes.some((l) => l.post_id === p.id && l.user_id === viewerId),
    comments: comments.filter((c) => c.post_id === p.id && !c.hidden_at).length,
  }))
}

/** 글 하나 + 댓글 (가려진 글은 글쓴이·최고 관리자만) */
export async function getPost(id: string, viewer: { id: string; isSuper: boolean }) {
  const { data } = await db().from('community_posts').select('id, author_id, category, title, body, hidden_at, created_at, updated_at').eq('id', id).maybeSingle()
  const post = data as PostRow | null
  if (!post || (post.hidden_at && post.author_id !== viewer.id && !viewer.isSuper)) return null
  const [card] = await decorate([post], viewer.id)
  const rows = (must(await db().from('community_comments').select('id, post_id, author_id, body, hidden_at, created_at').eq('post_id', id).order('created_at')) as CommentRow[])
    .filter((c) => !c.hidden_at || viewer.isSuper)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const nick = await nicknames(rows.map((c) => c.author_id))
  return { post: card, comments: rows.map((c) => ({ ...c, nick: nick.get(c.author_id) ?? '병아리', mine: c.author_id === viewer.id })) }
}

/** 회사 후기: 평균 별점·개수·최근 후기 (가려진 것 빼고) */
export async function companyReviews(companyId: string, limit = 20) {
  const rows = (must(
    await db().from('company_reviews').select('id, company_id, job_id, author_id, rating, body, hidden_at, created_at, updated_at').eq('company_id', companyId).is('hidden_at', null).order('created_at', { ascending: false }).limit(200),
  ) as ReviewRow[]).filter((r) => !r.hidden_at && r.company_id === companyId)
  const avg = rows.length ? Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 10) / 10 : 0
  const recent = rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
  const [nick, jobs] = await Promise.all([
    nicknames(recent.map((r) => r.author_id)),
    recent.length ? db().from('jobs').select('id, title').in('id', [...new Set(recent.map((r) => r.job_id))]).then((r) => must(r) as { id: string; title: string }[]) : [],
  ])
  const title = new Map(jobs.map((j) => [j.id, j.title]))
  return { avg, count: rows.length, recent: recent.map((r) => ({ ...r, nick: nick.get(r.author_id) ?? '병아리', jobTitle: title.get(r.job_id) ?? '' })) }
}

/** 이 근무자가 후기를 쓸 수 있는 공고인지: 그 공고에서 실제로 일한(출근 기록이 있는) 경우만 */
export async function workedJob(userId: string, jobId: string): Promise<boolean> {
  const { count } = await db().from('attendance').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('job_id', jobId).not('clock_in', 'is', null)
  return (count ?? 0) > 0
}

/** 게시판에 글을 쓸 수 있는 사람: 근무자·전문가 (회사 관리자·외주 업체는 읽기만) */
export const canWrite = (u: { role: string; memberType?: string | null }) => u.role !== 'admin' && u.memberType !== 'vendor'

/** '방금 · 5분 전 · 3시간 전 · 2일 전 · 10월 3일' */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86_400) return `${Math.floor(s / 3600)}시간 전`
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}일 전`
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

/** 최근 후기 (여러 회사, 커뮤니티 '회사 후기' 탭) */
export async function recentReviews(limit = 30) {
  const rows = (must(
    await db().from('company_reviews').select('id, company_id, job_id, author_id, rating, body, hidden_at, created_at, updated_at').is('hidden_at', null).order('created_at', { ascending: false }).limit(limit),
  ) as ReviewRow[])
    .filter((r) => !r.hidden_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
  if (!rows.length) return []
  const [nick, cos, jobs] = await Promise.all([
    nicknames(rows.map((r) => r.author_id)),
    db().from('companies').select('id, company_name').in('id', [...new Set(rows.map((r) => r.company_id))]).then((r) => must(r) as { id: string; company_name: string }[]),
    db().from('jobs').select('id, title').in('id', [...new Set(rows.map((r) => r.job_id))]).then((r) => must(r) as { id: string; title: string }[]),
  ])
  const co = new Map(cos.map((c) => [c.id, c.company_name]))
  const title = new Map(jobs.map((j) => [j.id, j.title]))
  return rows.map((r) => ({ ...r, nick: nick.get(r.author_id) ?? '병아리', companyName: co.get(r.company_id) ?? '', jobTitle: title.get(r.job_id) ?? '' }))
}

/** 회사 평균 별점 (공고·회사 화면 배지용). 후기가 없거나 읽지 못하면 null — 화면이 깨지지 않게 */
export async function companyRating(companyId: string): Promise<{ avg: number; count: number } | null> {
  const { data, error } = await db().from('company_reviews').select('rating, hidden_at, company_id').eq('company_id', companyId).is('hidden_at', null).limit(500)
  if (error || !data) return null
  const rows = (data as { rating: number; hidden_at: string | null; company_id: string }[]).filter((r) => !r.hidden_at && r.company_id === companyId)
  if (!rows.length) return null
  return { avg: Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 10) / 10, count: rows.length }
}

/** 내가 후기를 쓴 공고들 (지난 근무 화면의 '후기 쓰기/고치기') */
export async function myReviewedJobs(userId: string): Promise<Set<string>> {
  const { data } = await db().from('company_reviews').select('job_id, author_id').eq('author_id', userId)
  return new Set(((data ?? []) as { job_id: string; author_id: string }[]).filter((r) => r.author_id === userId).map((r) => r.job_id))
}

/** 별 다섯 개 문자열 (반올림) */
export const starsText = (avg: number) => '★★★★★'.slice(0, Math.round(avg)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(avg))

export type ModItem = {
  type: 'post' | 'comment' | 'review'
  id: string
  title: string
  body: string
  nick: string
  hidden: boolean
  href: string | null
  reasons: string[]
  reports: number
  created_at: string
}

/** 최고 관리자 확인 목록: 아직 처리 안 한 신고가 있는 것 + 가려진 것 (신고 많은 것부터) */
export async function moderationQueue(): Promise<ModItem[]> {
  const [reports, hp, hc, hr] = await Promise.all([
    db().from('community_reports').select('target_type, target_id, reason, resolved_at').is('resolved_at', null).limit(500).then((r) => must(r) as { target_type: ModItem['type']; target_id: string; reason: string; resolved_at: string | null }[]),
    db().from('community_posts').select('id').not('hidden_at', 'is', null).limit(50).then((r) => must(r) as { id: string }[]),
    db().from('community_comments').select('id').not('hidden_at', 'is', null).limit(50).then((r) => must(r) as { id: string }[]),
    db().from('company_reviews').select('id').not('hidden_at', 'is', null).limit(50).then((r) => must(r) as { id: string }[]),
  ])
  const open = reports.filter((r) => !r.resolved_at)
  const ids = (t: ModItem['type'], hidden: { id: string }[]) => [...new Set([...open.filter((r) => r.target_type === t).map((r) => r.target_id), ...hidden.map((h) => h.id)])]
  const [pIds, cIds, rIds] = [ids('post', hp), ids('comment', hc), ids('review', hr)]
  const [posts, comments, reviews] = await Promise.all([
    pIds.length ? db().from('community_posts').select('id, author_id, title, body, hidden_at, created_at').in('id', pIds).then((r) => must(r) as (PostRow & { author_id: string })[]) : [],
    cIds.length ? db().from('community_comments').select('id, post_id, author_id, body, hidden_at, created_at').in('id', cIds).then((r) => must(r) as CommentRow[]) : [],
    rIds.length ? db().from('company_reviews').select('id, company_id, author_id, rating, body, hidden_at, created_at').in('id', rIds).then((r) => must(r) as ReviewRow[]) : [],
  ])
  const nick = await nicknames([...posts, ...comments, ...reviews].map((x) => x.author_id))
  const rep = (t: ModItem['type'], id: string) => open.filter((r) => r.target_type === t && r.target_id === id)
  const items: ModItem[] = [
    ...posts.map((p) => ({ type: 'post' as const, id: p.id, title: p.title, body: p.body, nick: nick.get(p.author_id) ?? '병아리', hidden: !!p.hidden_at, href: `/community/${p.id}`, reasons: rep('post', p.id).map((r) => r.reason), reports: rep('post', p.id).length, created_at: p.created_at })),
    ...comments.map((c) => ({ type: 'comment' as const, id: c.id, title: '댓글', body: c.body, nick: nick.get(c.author_id) ?? '병아리', hidden: !!c.hidden_at, href: `/community/${c.post_id}`, reasons: rep('comment', c.id).map((r) => r.reason), reports: rep('comment', c.id).length, created_at: c.created_at })),
    ...reviews.map((r) => ({ type: 'review' as const, id: r.id, title: `후기 ★${r.rating}`, body: r.body, nick: nick.get(r.author_id) ?? '병아리', hidden: !!r.hidden_at, href: `/community/company/${r.company_id}`, reasons: rep('review', r.id).map((x) => x.reason), reports: rep('review', r.id).length, created_at: r.created_at })),
  ]
  return items.sort((a, b) => b.reports - a.reports || b.created_at.localeCompare(a.created_at))
}

/** 최근 7일 안에 출근한 공고 중 아직 후기를 안 쓴 것 하나 (내 근무 화면의 '후기 남기기' 안내). 못 읽으면 null */
export async function reviewNudge(userId: string): Promise<{ jobId: string; title: string; workDate: string } | null> {
  try {
    const since = new Date(Date.now() - 7 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10)
    const { data } = await db().from('attendance').select('job_id, user_id, work_date, clock_in, clock_out, job:jobs(title, end_date)').eq('user_id', userId).not('clock_in', 'is', null).gte('work_date', since).limit(50)
    const rows = ((data ?? []) as unknown as { job_id: string; user_id: string; work_date: string; clock_in: string | null; clock_out: string | null; job: { title: string; end_date: string } | null }[])
      .filter((r) => r.user_id === userId && r.clock_in && r.clock_out && r.work_date >= since && r.job)
      .sort((a, b) => b.work_date.localeCompare(a.work_date))
    if (!rows.length) return null
    const done = await myReviewedJobs(userId)
    const r = rows.find((x) => !done.has(x.job_id))
    return r ? { jobId: r.job_id, title: r.job!.title, workDate: r.work_date } : null
  } catch {
    return null
  }
}

/** 여러 회사의 평균 별점 (공고 목록 카드용). 후기가 없거나 못 읽으면 빈 목록 */
export async function companyRatings(companyIds: string[]): Promise<Record<string, { avg: number; count: number }>> {
  const ids = [...new Set(companyIds.filter(Boolean))]
  if (!ids.length) return {}
  try {
    const { data, error } = await db().from('company_reviews').select('company_id, rating, hidden_at').in('company_id', ids).is('hidden_at', null).limit(2000)
    if (error || !data) return {}
    const sum: Record<string, { s: number; n: number }> = {}
    for (const r of data as { company_id: string; rating: number; hidden_at: string | null }[]) {
      if (r.hidden_at || !ids.includes(r.company_id)) continue
      const g = (sum[r.company_id] ??= { s: 0, n: 0 })
      g.s += r.rating
      g.n += 1
    }
    return Object.fromEntries(Object.entries(sum).map(([id, g]) => [id, { avg: Math.round((g.s / g.n) * 10) / 10, count: g.n }]))
  } catch {
    return {}
  }
}

/** 마지막으로 커뮤니티를 본 뒤 내 글에 남이 단 새 댓글 (내 근무 화면 안내). 못 읽으면 null */
export async function newCommentsOnMine(userId: string, since: string | null): Promise<{ count: number; postId: string; title: string } | null> {
  try {
    const { data: posts } = await db().from('community_posts').select('id, title, author_id, hidden_at').eq('author_id', userId).is('hidden_at', null).limit(100)
    const mine = ((posts ?? []) as { id: string; title: string; author_id: string; hidden_at: string | null }[]).filter((p) => p.author_id === userId && !p.hidden_at)
    if (!mine.length) return null
    const { data: cs } = await db().from('community_comments').select('post_id, author_id, created_at, hidden_at').in('post_id', mine.map((p) => p.id)).neq('author_id', userId).limit(500)
    const fresh = ((cs ?? []) as { post_id: string; author_id: string; created_at: string; hidden_at: string | null }[])
      .filter((c) => c.author_id !== userId && !c.hidden_at && (!since || c.created_at > since))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (!fresh.length) return null
    const post = mine.find((p) => p.id === fresh[0].post_id)!
    return { count: fresh.length, postId: post.id, title: post.title }
  } catch {
    return null
  }
}

/** 내 커뮤니티 활동: 쓴 글 · 단 댓글 · 받은 좋아요 (내 정보 별명 칸). 못 읽으면 0 */
export async function myActivity(userId: string): Promise<{ posts: number; comments: number; likes: number }> {
  try {
    const [{ data: posts }, { count: comments }] = await Promise.all([
      db().from('community_posts').select('id, author_id').eq('author_id', userId).limit(500),
      db().from('community_comments').select('id', { count: 'exact', head: true }).eq('author_id', userId),
    ])
    const ids = ((posts ?? []) as { id: string; author_id: string }[]).filter((p) => p.author_id === userId).map((p) => p.id)
    const { count: likes } = ids.length ? await db().from('community_likes').select('post_id', { count: 'exact', head: true }).in('post_id', ids) : { count: 0 }
    return { posts: ids.length, comments: comments ?? 0, likes: likes ?? 0 }
  } catch {
    return { posts: 0, comments: 0, likes: 0 }
  }
}

/** 커뮤니티 대량 열람 막기 (로그인한 계정으로 글을 자동으로 긁어 가는 것 방지): 한 시간에 글 300개까지. 넘으면 false */
export async function readAllowed(userId: string): Promise<boolean> {
  const { overLimit } = await import('./ratelimit')
  return !(await overLimit(`community-read:${userId}`, 300, 3600))
}
