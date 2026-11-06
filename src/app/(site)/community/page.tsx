import Icon, { type IconName } from '@/components/Icon'
import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import CommunitySeen from '@/components/CommunitySeen'
import { ago, canPost, canWrite, CATEGORIES, categoryOf, hotPosts, isCategory, listPosts, recentReviews } from '@/lib/community'
import { requireUser } from '@/lib/session'
import { coworkersEnabled, linkedAmong } from '@/lib/coworkers'
import { PACKS, splitPostBody } from '@/lib/stickers'

/** 이모티콘 아이디 → 작은 그림 */
const PACK_THUMB = new Map(PACKS.flatMap((p) => p.items.map((it) => [it.id, it.thumb] as const)))

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
  const writer = canWrite(user) // 내 지원 보여 주기 등 근무자끼리 기능
  const poster = canPost(user) // 글·댓글·좋아요 (관리자도)
  // 나에게 지원 공고를 보여 주는 사람이 쓴 글에는 '🤝 동료' (상대가 고른 경우만)
  const [pals, palsOn] = writer ? await Promise.all([linkedAmong(user.id, posts.map((p) => p.author_id)), coworkersEnabled()]) : [new Set<string>(), false]
  const tabs: { id: string; label: string; icon: IconName | '' }[] = [
    { id: '', label: '전체', icon: '' },
    { id: 'hot', label: '인기', icon: 'flame' },
    ...CATEGORIES,
    { id: 'review', label: '회사 후기', icon: 'star' },
    ...(poster ? [{ id: 'mine', label: '내 글', icon: 'pen' as const }] : []),
  ]

  return (
    <div className="space-y-4">
      <CommunitySeen />
      <Flash m={sp.m} />
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">커뮤니티</h1>
          <p className="mt-0.5 text-sm text-sub">별명으로 편하게 묻고 나눠요</p>
        </div>
        {poster && !reviewTab && (
          <Link href={`/community/new${category ? `?c=${category}` : ''}`} className="btn-primary btn-sm shrink-0" data-write>
            <Icon name="pen" /> 글쓰기
          </Link>
        )}
      </div>

      {/* 검색: 제목·내용에서 (말머리는 그대로) */}
      {!reviewTab && (
        <form action="/community" role="search" className="relative" data-community-search>
          {c && <input type="hidden" name="c" value={c} />}
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute">
            <Icon name="search" />
          </span>
          <input name="q" type="search" defaultValue={q} maxLength={40} enterKeyHint="search" placeholder="주차, 복장, 식사처럼 찾고 싶은 말" aria-label="글 검색" className="input pl-10" />
        </form>
      )}

      {/* 말머리: 가로로 밀어서 고름 */}
      <nav aria-label="말머리" className="fade-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" data-community-tabs>
        {tabs.map((t) => {
          const on = t.id === c || (!t.id && !category && !reviewTab && !mine && !hot)
          return (
            <Link
              key={t.id || 'all'}
              href={t.id ? `/community?c=${t.id}` : '/community'}
              aria-current={on ? 'page' : undefined}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap ring-1 transition active:scale-95 ${on ? 'bg-ink text-white ring-ink' : 'bg-white text-sub ring-line'}`}
            >
              {t.icon && <Icon name={t.icon} className={on ? '' : 'text-mute'} />} {t.label}
            </Link>
          )
        })}
      </nav>

      {/* 운영자가 켠 경우만 */}
      {writer && palsOn && !reviewTab && (
        <Link href="/community/coworkers" className="card-link flex items-center gap-3 p-3.5" data-coworkers-link>
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-lg">
            <Icon name="users" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px]">함께 일한 사람</b>
            <span className="block truncate text-xs text-sub">내가 고른 사람에게만 내 지원 공고가 보여요</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-brand-600">보기 →</span>
        </Link>
      )}

      {!poster && (
        <p className="rounded-2xl bg-bg px-4 py-3 text-sm text-sub" data-readonly>
          👀 외주 업체 계정은 읽기만 할 수 있어요.
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
            <Icon name="pen" /> 첫 글 쓰기 →
          </Link>
        </Empty>
      ) : posts.length === 0 ? (
        <Empty icon="💬" sticker="hi" title={category ? `${categoryOf(category).label} 글이 아직 없어요` : '첫 글을 남겨 주세요'}>
          {poster ? (
            <Link href="/community/new" className="font-semibold text-brand-600">
              <Icon name="pen" /> 첫 글 쓰기 →
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
            // 이모티콘을 붙인 글은 목록에서 작은 그림으로 (128px 작은 그림)
            const { text, sticker } = splitPostBody(p.body)
            const thumb = sticker ? PACK_THUMB.get(sticker.id) : null
            return (
              <li key={p.id}>
                <Link href={`/community/${p.id}`} className="card-link block space-y-1.5 p-4" data-post transitionTypes={['nav-forward']}>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">
                      <Icon name={cat.icon} /> {cat.label}
                    </span>
                    {hot && i < 3 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">🔥 {i + 1}위</span>}
                    {p.author_id === user.id && <span className="text-mute">내 글</span>}
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="line-clamp-1 font-bold">{p.title}</p>
                      <p className="line-clamp-2 text-sm text-sub">{text}</p>
                    </div>
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element -- 목록의 작은 그림
                      <img src={thumb} alt={`이모티콘: ${sticker!.label}`} width={48} height={48} loading="lazy" decoding="async" className="size-12 shrink-0 object-contain" data-post-sticker-thumb />
                    )}
                  </div>
                  <p className="flex items-center gap-3 text-xs text-mute">
                    <span className="min-w-0 truncate">
                      {p.nick}
                      {pals.has(p.author_id) && (
                        <span className="ml-1 font-semibold text-brand-600" data-pal-badge>
                          <Icon name="users" /> 동료
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
