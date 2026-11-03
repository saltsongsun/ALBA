'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { AUTO_HIDE_REPORTS, canWrite, ensureNickname, isCategory, nicknameError, workedJob } from '@/lib/community'
import { audit } from '@/lib/data'
import { db, must } from '@/lib/db'
import { sendPush, superAdminIds } from '@/lib/push'
import { overLimit } from '@/lib/ratelimit'
import { requireUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

type State = { error?: string; ok?: string } | null

const text = (form: FormData, k: string) => String(form.get(k) ?? '').replace(/\r\n/g, '\n').trim()
/** 광고·피싱 글 막기: 링크는 2개까지 */
const tooManyLinks = (s: string) => (s.match(/https?:\/\/|www\./gi)?.length ?? 0) > 2
/** 개인정보 보호: 글에 쓴 휴대폰 번호는 가운데를 가림 (모두가 보는 게시판) */
const maskPhones = (s: string) => s.replace(/(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})/g, (_, a, _b, c) => `${a}-****-${c}`)

async function writer(next: string) {
  const user = await requireUser(next)
  if (!canWrite(user)) return { user, error: '회사 관리자·외주 업체 계정은 커뮤니티를 읽기만 할 수 있어요.' }
  return { user, error: null }
}

/** 글쓰기 (한 시간에 5개까지) */
export async function createPost(_: State, form: FormData): Promise<State> {
  const { user, error } = await writer('/community/new')
  if (error) return { error }
  const category = text(form, 'category')
  const title = text(form, 'title')
  const body = text(form, 'body')
  if (!isCategory(category)) return { error: '말머리를 골라 주세요.' }
  if (title.length < 2 || title.length > 60) return { error: '제목은 2~60자로 써 주세요.' }
  if (body.length < 2 || body.length > 3000) return { error: '내용은 2~3000자로 써 주세요.' }
  if (tooManyLinks(title + body)) return { error: '링크는 2개까지만 넣을 수 있어요.' }
  if (await overLimit(`community-post:${user.id}`, 5, 3600)) return { error: '글은 한 시간에 5개까지 쓸 수 있어요.' }
  await ensureNickname(user.id)
  const { data } = await db()
    .from('community_posts')
    .insert({ author_id: user.id, category, title: maskPhones(title), body: maskPhones(body) })
    .select('id')
    .single()
  revalidatePath('/community')
  redirect(`/community/${(data as { id: string }).id}`)
}

/** 내 글 지우기 */
export async function deletePost(postId: string) {
  const user = await requireUser('/community')
  if (!isUuid(postId)) return
  const { data } = await db().from('community_posts').select('author_id').eq('id', postId).maybeSingle()
  if (!data || ((data as { author_id: string }).author_id !== user.id && !user.isSuper)) return
  await db().from('community_posts').delete().eq('id', postId)
  if (user.isSuper && (data as { author_id: string }).author_id !== user.id) await audit(user.id, 'community.post_delete', (data as { author_id: string }).author_id, postId)
  revalidatePath('/community')
  redirect(`/community?m=${encodeURIComponent('글을 지웠어요.')}`)
}

/** 댓글 (한 시간에 30개까지) */
export async function addComment(postId: string, _: State, form: FormData): Promise<State> {
  const { user, error } = await writer(`/community/${postId}`)
  if (error) return { error }
  if (!isUuid(postId)) return { error: '글을 찾을 수 없어요.' }
  const body = text(form, 'body')
  if (body.length < 1 || body.length > 500) return { error: '댓글은 500자까지 쓸 수 있어요.' }
  if (tooManyLinks(body)) return { error: '링크는 2개까지만 넣을 수 있어요.' }
  const { data: post } = await db().from('community_posts').select('id, author_id, title, hidden_at').eq('id', postId).maybeSingle()
  const p = post as { id: string; author_id: string; title: string; hidden_at: string | null } | null
  if (!p || p.hidden_at) return { error: '가려진 글에는 댓글을 달 수 없어요.' }
  if (await overLimit(`community-comment:${user.id}`, 30, 3600)) return { error: '댓글을 너무 자주 달고 있어요. 잠시 뒤에 다시 써 주세요.' }
  const nick = await ensureNickname(user.id)
  must(await db().from('community_comments').insert({ post_id: postId, author_id: user.id, body: maskPhones(body) }))
  // 글쓴이에게 알림 (내 글에 내가 단 댓글은 빼고, 글마다 10분에 한 번)
  if (p.author_id !== user.id && !(await overLimit(`community-notify:${postId}`, 1, 600))) {
    after(() => sendPush([p.author_id], { title: `💬 ${nick}님이 댓글을 달았어요`, body: `${p.title}: ${body.slice(0, 60)}`, url: `/community/${postId}`, tag: `community-${postId}` }))
  }
  revalidatePath(`/community/${postId}`)
  return { ok: '댓글을 달았어요.' }
}

/** 내 댓글 지우기 */
export async function deleteComment(commentId: string, postId: string) {
  const user = await requireUser(`/community/${postId}`)
  if (!isUuid(commentId)) return
  const { data } = await db().from('community_comments').select('author_id').eq('id', commentId).maybeSingle()
  if (!data || ((data as { author_id: string }).author_id !== user.id && !user.isSuper)) return
  await db().from('community_comments').delete().eq('id', commentId)
  revalidatePath(`/community/${postId}`)
}

/** 좋아요 누르기·취소 */
export async function toggleLike(postId: string): Promise<{ liked: boolean; likes: number } | { error: string }> {
  const user = await requireUser(`/community/${postId}`)
  if (!canWrite(user)) return { error: '읽기만 할 수 있는 계정이에요.' }
  if (!isUuid(postId)) return { error: '글을 찾을 수 없어요.' }
  if (await overLimit(`community-like:${user.id}`, 120, 3600)) return { error: '잠시 뒤에 다시 눌러 주세요.' }
  const { data: had } = await db().from('community_likes').select('post_id').eq('post_id', postId).eq('user_id', user.id).maybeSingle()
  if (had) await db().from('community_likes').delete().eq('post_id', postId).eq('user_id', user.id)
  else await db().from('community_likes').insert({ post_id: postId, user_id: user.id })
  const { count } = await db().from('community_likes').select('post_id', { count: 'exact', head: true }).eq('post_id', postId)
  return { liked: !had, likes: count ?? 0 }
}

/** 신고: 같은 것은 한 번만, 3번 쌓이면 자동으로 가리고 최고 관리자에게 알림 */
export async function report(target: 'post' | 'comment' | 'review', targetId: string, _: State, form: FormData): Promise<State> {
  const user = await requireUser('/community')
  if (!isUuid(targetId) || !['post', 'comment', 'review'].includes(target)) return { error: '신고할 수 없어요.' }
  const reason = text(form, 'reason').slice(0, 200) || '부적절한 내용'
  if (await overLimit(`community-report:${user.id}`, 20, 3600)) return { error: '신고가 너무 많아요. 잠시 뒤에 다시 해 주세요.' }
  const { data: dup } = await db().from('community_reports').select('id').eq('target_type', target).eq('target_id', targetId).eq('reporter_id', user.id).maybeSingle()
  if (dup) return { ok: '이미 신고했어요. 운영자가 확인할게요.' }
  must(await db().from('community_reports').insert({ target_type: target, target_id: targetId, reporter_id: user.id, reason }))
  const { count } = await db().from('community_reports').select('id', { count: 'exact', head: true }).eq('target_type', target).eq('target_id', targetId).is('resolved_at', null)
  const table = target === 'post' ? 'community_posts' : target === 'comment' ? 'community_comments' : 'company_reviews'
  if ((count ?? 0) >= AUTO_HIDE_REPORTS) {
    await db().from(table).update({ hidden_at: new Date().toISOString(), ...(target === 'post' ? { hidden_reason: '신고 누적' } : {}) }).eq('id', targetId).is('hidden_at', null)
    after(async () => sendPush(await superAdminIds(), { title: '🚩 신고가 쌓여 가렸어요', body: `커뮤니티 ${target === 'post' ? '글' : target === 'comment' ? '댓글' : '후기'} 하나가 신고 ${count}번으로 가려졌어요. 확인해 주세요.`, url: '/admin/community', tag: 'community-report' }))
  }
  return { ok: '신고했어요. 운영자가 확인할게요.' }
}

/** 별명 바꾸기 (하루 3번까지) */
export async function setNickname(_: State, form: FormData): Promise<State> {
  const user = await requireUser('/me/profile')
  const nick = text(form, 'nickname')
  const err = nicknameError(nick)
  if (err) return { error: err }
  const { data: taken } = await db().from('users').select('id').ilike('nickname', nick).maybeSingle()
  if (taken && (taken as { id: string }).id !== user.id) return { error: '이미 누가 쓰는 별명이에요.' }
  if (await overLimit(`nickname:${user.id}`, 3, 86_400)) return { error: '별명은 하루 3번까지 바꿀 수 있어요.' }
  const { error } = await db().from('users').update({ nickname: nick }).eq('id', user.id)
  if (error) return { error: '이미 누가 쓰는 별명이에요.' }
  revalidatePath('/community')
  return { ok: `별명을 '${nick}'(으)로 바꿨어요.` }
}

/** 회사·행사 후기 쓰기·고치기: 그 공고에서 실제로 일한 근무자만, 공고마다 하나 */
export async function saveReview(jobId: string, _: State, form: FormData): Promise<State> {
  const { user, error } = await writer('/me/history')
  if (error) return { error }
  if (!isUuid(jobId) || !(await workedJob(user.id, jobId))) return { error: '이 공고에서 일한 근무자만 후기를 쓸 수 있어요.' }
  const rating = Number(form.get('rating'))
  const body = text(form, 'body')
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: '별점을 골라 주세요.' }
  if (body.length < 5 || body.length > 500) return { error: '후기는 5~500자로 써 주세요.' }
  if (tooManyLinks(body)) return { error: '링크는 2개까지만 넣을 수 있어요.' }
  if (await overLimit(`review:${user.id}`, 10, 3600)) return { error: '잠시 뒤에 다시 시도해 주세요.' }
  await ensureNickname(user.id)
  const { data: job } = await db().from('jobs').select('company_id').eq('id', jobId).maybeSingle()
  const companyId = (job as { company_id: string } | null)?.company_id
  if (!companyId) return { error: '공고를 찾을 수 없어요.' }
  const { data: had } = await db().from('company_reviews').select('id').eq('job_id', jobId).eq('author_id', user.id).maybeSingle()
  if (had) must(await db().from('company_reviews').update({ rating, body: maskPhones(body), updated_at: new Date().toISOString() }).eq('id', (had as { id: string }).id))
  else must(await db().from('company_reviews').insert({ job_id: jobId, company_id: companyId, author_id: user.id, rating, body: maskPhones(body) }))
  revalidatePath('/me/history')
  return { ok: had ? '후기를 고쳤어요.' : '후기를 남겼어요. 다른 근무자에게 큰 도움이 돼요!' }
}

/** 최고 관리자: 가려진 것 다시 보이기 · 가리기 · 신고 처리 */
export async function moderate(target: 'post' | 'comment' | 'review', targetId: string, action: 'hide' | 'show') {
  const user = await requireUser('/admin/community')
  if (!user.isSuper || !isUuid(targetId)) return
  const table = target === 'post' ? 'community_posts' : target === 'comment' ? 'community_comments' : 'company_reviews'
  await db()
    .from(table)
    .update({ hidden_at: action === 'hide' ? new Date().toISOString() : null, ...(target === 'post' ? { hidden_reason: action === 'hide' ? '운영자 가림' : null } : {}) })
    .eq('id', targetId)
  await db().from('community_reports').update({ resolved_at: new Date().toISOString(), resolved_by: user.id }).eq('target_type', target).eq('target_id', targetId).is('resolved_at', null)
  await audit(user.id, `community.${action}`, null, `${target} ${targetId}`)
  revalidatePath('/admin/community')
}
