import Icon from '@/components/Icon'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deleteComment, deletePost } from '@/app/actions/community'
import { CommentForm, DoubleTapLike, LikeButton, ReplyButton, ReportButton } from '@/components/community'
import { ConfirmSubmit, ShareButton } from '@/components/ui'
import Flash from '@/components/Flash'
import CommunitySeen from '@/components/CommunitySeen'
import { ago, canPost, canWrite, categoryOf, getPost, readAllowed, relatedPosts } from '@/lib/community'
import { requireUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'
import { linkedAmong } from '@/lib/coworkers'
import { splitPostBody, stickerOf } from '@/lib/stickers'
import Sticker from '@/components/Sticker'

export const metadata: Metadata = { title: '커뮤니티 글' }

export default async function PostPage(props: PageProps<'/community/[id]'>) {
  const { id } = await props.params
  const sp = await props.searchParams
  const user = await requireUser(`/community/${id}`)
  if (!isUuid(id)) notFound()
  // 한 시간에 너무 많은 글을 열면 잠시 막음 (자동 수집 방지, 최고 관리자는 제외)
  if (!user.isSuper && !(await readAllowed(user.id))) {
    return (
      <div className="mx-auto max-w-sm pt-6" data-read-limit>
        <div className="card space-y-2 text-center">
          <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-rose-50 text-2xl">
            ✋
          </span>
          <h1 className="text-xl font-extrabold">잠시 쉬었다 봐 주세요</h1>
          <p className="text-sm text-sub">한 시간 동안 글을 너무 많이 열었어요. 자동으로 글을 모아 가는 것을 막기 위해 잠시 멈췄어요.</p>
          <Link href="/community" className="btn-gray btn-sm mt-2">
            커뮤니티로
          </Link>
        </div>
      </div>
    )
  }
  const got = await getPost(id, { id: user.id, isSuper: user.isSuper })
  if (!got) notFound()
  const { post, comments } = got
  const cat = categoryOf(post.category)
  const mine = post.author_id === user.id
  const writer = canWrite(user) // 동료 표시 등 근무자끼리 기능
  const poster = canPost(user) // 글·댓글·좋아요 (관리자도)
  const [related, pals] = await Promise.all([
    post.hidden_at ? [] : relatedPosts(post, user.id),
    writer ? linkedAmong(user.id, [post.author_id, ...comments.map((c) => c.author_id)]) : new Set<string>(),
  ])
  const PalBadge = ({ id }: { id: string }) =>
    pals.has(id) ? (
      <span className="rounded-full bg-brand-50 px-1.5 text-[10px] font-bold text-brand-700" data-pal-badge>
        🤝 동료
      </span>
    ) : null

  return (
    <div className="space-y-4">
      <CommunitySeen />
      <Flash m={sp.m} />
      <Link href={`/community?c=${post.category}`} className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← {cat.label}
      </Link>
      <article className="card space-y-3" data-post-detail>
        {post.hidden_at && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" data-hidden-note>
            🚫 신고가 쌓이거나 운영자가 가려서 다른 회원에게는 보이지 않아요.
          </p>
        )}
        <span className="badge bg-brand-50 text-brand-700">
          <Icon name={cat.icon} /> {cat.label}
        </span>
        <h1 className="text-xl leading-snug font-extrabold break-words">{post.title}</h1>
        <p className="text-sm text-mute">
          <b className="font-semibold text-sub">{post.nick}</b> <PalBadge id={post.author_id} /> · {ago(post.created_at)}
          {Date.parse(post.updated_at) - Date.parse(post.created_at) > 60_000 && <span data-edited> · 수정됨</span>}
        </p>
        {/* 내용을 두 번 톡 누르면 좋아요 */}
        <DoubleTapLike enabled={poster}>
          {(() => {
            // 맨 끝 이모티콘 줄은 그림으로 (글쓰기의 '이모티콘 넣기')
            const { text, sticker } = splitPostBody(post.body)
            return (
              <>
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{text}</p>
                {sticker && (
                  <div className="mt-2" data-post-sticker-view>
                    <Sticker id={sticker.id} size={140} />
                  </div>
                )}
              </>
            )
          })()}
        </DoubleTapLike>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <LikeButton postId={post.id} liked={post.liked} likes={post.likes} disabled={!poster} />
          <div className="flex items-center gap-3">
            {!post.hidden_at && <ShareButton title={post.title} text={`해피워크 커뮤니티: ${post.title}`} path={`/community/${post.id}`} className="text-xs font-semibold text-mute hover:text-brand-600" />}
            {mine && poster && !post.hidden_at && (
              <Link href={`/community/${post.id}/edit`} className="text-xs font-semibold text-mute hover:text-brand-600" data-edit-link>
                ✏️ 고치기
              </Link>
            )}
            {(mine || user.isSuper) && (
              <form action={deletePost.bind(null, post.id)}>
                <ConfirmSubmit className="text-xs font-semibold text-mute hover:text-rose-600" confirmText="한 번 더 누르면 지워져요">
                  🗑️ 지우기
                </ConfirmSubmit>
              </form>
            )}
            {!mine && <ReportButton target="post" id={post.id} />}
          </div>
        </div>
      </article>

      <section className="space-y-3" data-comments>
        <h2 className="font-bold">
          댓글 <span className="text-brand-600 tabular-nums">{comments.filter((c) => !c.hidden_at).length}</span>
        </h2>
        {comments.length > 0 && (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className={`rounded-2xl px-4 py-3 ${c.mine ? 'bg-brand-50/60' : 'bg-white ring-1 ring-line'}`} data-comment data-mine={c.mine ? '' : undefined}>
                <p className="flex items-center gap-1.5 text-xs text-mute">
                  <b className="font-semibold text-sub">{c.nick}</b>
                  <PalBadge id={c.author_id} />
                  {c.author_id === post.author_id && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700">글쓴이</span>}
                  <span>· {ago(c.created_at)}</span>
                  {c.hidden_at && <span className="font-semibold text-rose-600">· 가려짐</span>}
                </p>
                {stickerOf(c.body) ? (
                  // 이모티콘 댓글은 말풍선 없이 그림으로
                  <div className="mt-1.5" data-comment-sticker>
                    <Sticker id={stickerOf(c.body)!.id} size={96} />
                  </div>
                ) : (
                <p className="mt-1 text-[15px] whitespace-pre-wrap break-words">
                  {/* 답글이면 맨 앞 '@별명'을 강조 */}
                  {(() => {
                    const m = c.body.match(/^@(\S{2,12})\s/)
                    return m ? (
                      <>
                        <b className="font-semibold text-brand-600">@{m[1]}</b> {c.body.slice(m[0].length)}
                      </>
                    ) : (
                      c.body
                    )
                  })()}
                </p>
                )}
                <div className="mt-1.5 flex items-center justify-end gap-3">
                  {poster && !post.hidden_at && !c.mine && <ReplyButton nick={c.nick} />}
                  {(c.mine || user.isSuper) && (
                    <form action={deleteComment.bind(null, c.id, post.id)}>
                      <ConfirmSubmit className="text-xs font-semibold text-mute hover:text-rose-600" confirmText="한 번 더 누르면 지워져요">
                        지우기
                      </ConfirmSubmit>
                    </form>
                  )}
                  {!c.mine && <ReportButton target="comment" id={c.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        {poster && !post.hidden_at ? (
          <div className="card">
            <CommentForm postId={post.id} />
          </div>
        ) : (
          !poster && <p className="text-sm text-mute">읽기만 할 수 있는 계정이에요.</p>
        )}
      </section>

      {/* 같은 말머리의 다른 글 (계속 둘러보게) */}
      {related.length > 0 && (
        <section className="space-y-2" data-related>
          <h2 className="font-bold">
            <Icon name={cat.icon} /> 다른 {cat.label} 글
          </h2>
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/community/${r.id}`} className="card-link flex items-center gap-3 p-3.5" transitionTypes={['nav-forward']}>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px]">{r.title}</b>
                    <span className="block truncate text-xs text-mute">
                      {r.nick} · {ago(r.created_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-mute tabular-nums">
                    ♥ {r.likes} · 💬 {r.comments}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
