import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deleteComment, deletePost } from '@/app/actions/community'
import { CommentForm, DoubleTapLike, LikeButton, ReplyButton, ReportButton } from '@/components/community'
import { ConfirmSubmit } from '@/components/ui'
import Flash from '@/components/Flash'
import { ago, canWrite, categoryOf, getPost, relatedPosts } from '@/lib/community'
import { requireUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '커뮤니티 글' }

export default async function PostPage(props: PageProps<'/community/[id]'>) {
  const { id } = await props.params
  const sp = await props.searchParams
  const user = await requireUser(`/community/${id}`)
  if (!isUuid(id)) notFound()
  const got = await getPost(id, { id: user.id, isSuper: user.isSuper })
  if (!got) notFound()
  const { post, comments } = got
  const cat = categoryOf(post.category)
  const mine = post.author_id === user.id
  const writer = canWrite(user)
  const related = post.hidden_at ? [] : await relatedPosts(post, user.id)

  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <Link href={`/community?c=${post.category}`} className="text-sm font-semibold text-sub">
        ← {cat.label}
      </Link>
      <article className="card space-y-3" data-post-detail>
        {post.hidden_at && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" data-hidden-note>
            🚫 신고가 쌓이거나 운영자가 가려서 다른 회원에게는 보이지 않아요.
          </p>
        )}
        <span className="badge bg-brand-50 text-brand-700">
          {cat.icon} {cat.label}
        </span>
        <h1 className="text-xl leading-snug font-extrabold break-words">{post.title}</h1>
        <p className="text-sm text-mute">
          <b className="font-semibold text-sub">{post.nick}</b> · {ago(post.created_at)}
        </p>
        {/* 내용을 두 번 톡 누르면 좋아요 */}
        <DoubleTapLike enabled={writer}>
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{post.body}</p>
        </DoubleTapLike>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <LikeButton postId={post.id} liked={post.liked} likes={post.likes} disabled={!writer} />
          <div className="flex items-center gap-3">
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
              <li key={c.id} className={`rounded-2xl px-4 py-3 ${c.mine ? 'bg-brand-50/60' : 'bg-white ring-1 ring-line'}`} data-comment>
                <p className="flex items-center gap-1.5 text-xs text-mute">
                  <b className="font-semibold text-sub">{c.nick}</b>
                  {c.author_id === post.author_id && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700">글쓴이</span>}
                  <span>· {ago(c.created_at)}</span>
                  {c.hidden_at && <span className="font-semibold text-rose-600">· 가려짐</span>}
                </p>
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
                <div className="mt-1.5 flex items-center justify-end gap-3">
                  {writer && !post.hidden_at && !c.mine && <ReplyButton nick={c.nick} />}
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
        {writer && !post.hidden_at ? (
          <div className="card">
            <CommentForm postId={post.id} />
          </div>
        ) : (
          !writer && <p className="text-sm text-mute">읽기만 할 수 있는 계정이에요.</p>
        )}
      </section>

      {/* 같은 말머리의 다른 글 (계속 둘러보게) */}
      {related.length > 0 && (
        <section className="space-y-2" data-related>
          <h2 className="font-bold">
            {cat.icon} 다른 {cat.label} 글
          </h2>
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/community/${r.id}`} className="card-link flex items-center gap-3 p-3.5">
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
