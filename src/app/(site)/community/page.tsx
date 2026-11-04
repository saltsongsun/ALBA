import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import CommunitySeen from '@/components/CommunitySeen'
import { ago, canWrite, CATEGORIES, categoryOf, hotPosts, isCategory, listPosts, recentReviews } from '@/lib/community'
import { requireUser } from '@/lib/session'
import { linkedAmong, pendingRequests } from '@/lib/coworkers'

export const metadata: Metadata = { title: '커뮤니티' }

/** 커뮤니티: 근무자 게시판(자유·꿀팁·질문) + 회사 후기. 가입한 회원만, 글쓴이는 별명 */
export default async function CommunityPage(props: PageProps<'/community'>) {
  const sp = await props.searchParams
  const user = await requireUser('/community')
  const c = typeof sp.c === 'string' ? sp.c : ''
  const reviewTab = c === 'review'
  const category = isCategory(c) ? c : null
  const mine = c === 'mine'
  const hot = c === 'hot'
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 40) : ''
  const [posts, reviews] = await Promise.all([
    reviewTab ? [] : hot && !q ? hotPosts(user.id) : listPosts({ category, viewerId: user.id, q, mine }),
    reviewTab ? recentReviews(30) : [],
  ])
  const writer = canWrite(user)
  // 서로 동료 맺은 사람이 쓴 글에는 '🤝 동료'
  const [pals, requests] = writer ? await Promise.all([linkedAmong(user.id, posts.map((p) => p.author_id)), pendingRequests(user.id)]) : [new Set<string>(), 0]
  const tabs = [{ id: '', label: '전체', icon: '' }, { id: 'hot', label: '인기', icon: '🔥' }, ...CATEGORIES, { id: 'review', label: '회사 후기', icon: '⭐' }, ...(writer ? [{ id: 'mine', label: '내 글', icon: '✍️' }] : [])]

  return (
    <div className="space-y-4">
      <CommunitySeen />
      <Flash m={sp.m} />
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">커뮤니티</h1>
          <p className="mt-0.5 text-sm text-sub">별명으로 편하게 묻고 나눠요</p>
        </div>
        {writer && !reviewTab && (
          <Link href={`/community/new${category ? `?c=${category}` : ''}`} className="btn-primary btn-sm shrink-0" data-write>
            ✏️ 글쓰기
          </Link>
        )}
      </div>

      {/* 검색: 제목·내용에서 (말머리는 그대로) */}
      {!reviewTab && (
        <form action="/community" role="search" className="relative" data-community-search>
          {c && <input type="hidden" name="c" value={c} />}
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute">
            🔍
          </span>
          <input name="q" type="search" defaultValue={q} maxLength={40} enterKeyHint="search" placeholder="주차, 복장, 식사처럼 찾고 싶은 말" aria-label="글 검색" className="input pl-10" />
        </form>
      )}

      {/* 말머리: 가로로 밀어서 고름 */}
      <nav aria-label="말머리" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" data-community-tabs>
        {tabs.map((t) => {
          const on = t.id === c || (!t.id && !category && !reviewTab && !mine && !hot)
          return (
            <Link
              key={t.id || 'all'}
              href={t.id ? `/community?c=${t.id}` : '/community'}
              aria-current={on ? 'page' : undefined}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap ring-1 transition active:scale-95 ${on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-sub ring-line'}`}
            >
              {t.icon && <span aria-hidden>{t.icon} </span>}
              {t.label}
            </Link>
          )
        })}
      </nav>

      {writer && !reviewTab && (
        <Link href="/community/coworkers" className="card-link flex items-center gap-3 p-3.5" data-coworkers-link>
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-lg">
            🤝
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px]">함께 일한 사람</b>
            <span className="block truncate text-xs text-sub">동료를 맺으면 같은 공고에 지원했을 때 알 수 있어요</span>
          </span>
          {requests > 0 ? (
            <span className="shrink-0 animate-pop rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white" data-request-badge>
              👋 요청 {requests}
            </span>
          ) : (
            <span className="shrink-0 text-sm font-semibold text-brand-600">보기 →</span>
          )}
        </Link>
      )}

      {!writer && (
        <p className="rounded-2xl bg-bg px-4 py-3 text-sm text-sub" data-readonly>
          👀 회사 관리자·외주 업체 계정은 읽기만 할 수 있어요. 근무자 목소리를 들어 보세요.
        </p>
      )}

      {reviewTab ? (
        reviews.length === 0 ? (
          <Empty icon="⭐" sticker="thanks" title="아직 후기가 없어요">
            일한 뒤 <Link href="/me/history" className="font-semibold text-brand-600">지난 근무</Link>에서 후기를 남길 수 있어요.
          </Empty>
        ) : (
          <ul className="stagger space-y-2" data-review-list>
            {reviews.map((r) => (
              <li key={r.id} className="card space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/community/company/${r.company_id}`} className="min-w-0 truncate font-bold">
                    🏢 {r.companyName}
                  </Link>
                  <span className="shrink-0 text-sm font-bold text-amber-500" aria-label={`별점 ${r.rating}점`}>
                    {'★'.repeat(r.rating)}
                    <span className="text-line">{'★'.repeat(5 - r.rating)}</span>
                  </span>
                </div>
                <p className="text-[15px] whitespace-pre-wrap break-words">{r.body}</p>
                <p className="truncate text-xs text-mute">
                  {r.nick} · {r.jobTitle} · {ago(r.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : posts.length === 0 && q ? (
        <Empty icon="🔍" sticker="schedule" title={`'${q}' 글이 없어요`}>
          다른 말로 찾아보거나{' '}
          <Link href={c ? `/community?c=${c}` : '/community'} className="font-semibold text-brand-600">
            검색 지우기
          </Link>
        </Empty>
      ) : posts.length === 0 && hot ? (
        <Empty icon="🔥" sticker="wait" title="아직 인기 글이 없어요">
          좋아요·댓글이 달린 글이 여기에 모여요.
        </Empty>
      ) : posts.length === 0 && mine ? (
        <Empty icon="✍️" sticker="hi" title="아직 쓴 글이 없어요">
          <Link href="/community/new" className="font-semibold text-brand-600">
            ✏️ 첫 글 쓰기 →
          </Link>
        </Empty>
      ) : posts.length === 0 ? (
        <Empty icon="💬" sticker="hi" title={category ? `${categoryOf(category).label} 글이 아직 없어요` : '첫 글을 남겨 주세요'}>
          {writer ? (
            <Link href="/community/new" className="font-semibold text-brand-600">
              ✏️ 첫 글 쓰기 →
            </Link>
          ) : (
            '근무자들이 글을 올리면 여기에 보여요.'
          )}
        </Empty>
      ) : (
        <>
        {q && (
          <p className="text-sm text-sub" data-search-count>
            &lsquo;<b className="text-ink">{q}</b>&rsquo; 글 <b className="text-brand-700 tabular-nums">{posts.length}</b>개
          </p>
        )}
        <ul className="stagger space-y-2" data-post-list>
          {posts.map((p, i) => {
            const cat = categoryOf(p.category)
            return (
              <li key={p.id}>
                <Link href={`/community/${p.id}`} className="card-link block space-y-1.5 p-4" data-post transitionTypes={['nav-forward']}>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">
                      {cat.icon} {cat.label}
                    </span>
                    {hot && i < 3 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">🔥 {i + 1}위</span>}
                    {p.author_id === user.id && <span className="text-mute">내 글</span>}
                  </div>
                  <p className="line-clamp-1 font-bold">{p.title}</p>
                  <p className="line-clamp-2 text-sm text-sub">{p.body}</p>
                  <p className="flex items-center gap-3 text-xs text-mute">
                    <span className="min-w-0 truncate">
                      {p.nick}
                      {pals.has(p.author_id) && (
                        <span className="ml-1 font-semibold text-brand-600" data-pal-badge>
                          🤝 동료
                        </span>
                      )}{' '}
                      · {ago(p.created_at)}
                    </span>
                    <span className="ml-auto flex shrink-0 gap-2.5 tabular-nums">
                      <span className={p.liked ? 'text-rose-500' : ''}>♥ {p.likes}</span>
                      <span>💬 {p.comments}</span>
                    </span>
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
        </>
      )}
    </div>
  )
}
