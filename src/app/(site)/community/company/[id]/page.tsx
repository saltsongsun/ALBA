import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Empty from '@/components/Empty'
import { ReportButton } from '@/components/community'
import { ago, companyReviews } from '@/lib/community'
import { db } from '@/lib/db'
import { replyMinutes, replySpan } from '@/lib/data'
import { kstDate } from '@/lib/time'
import { requireUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '회사 후기' }

/** 한 회사의 후기: 평균 별점 + 별점 나눔 막대 + 최근 후기 (실제로 일한 근무자만 쓸 수 있음) */
export default async function CompanyReviewsPage(props: PageProps<'/community/company/[id]'>) {
  const { id } = await props.params
  const sp = await props.searchParams
  const sort = sp.s === 'high' || sp.s === 'low' ? sp.s : 'new'
  const user = await requireUser(`/community/company/${id}`)
  if (!isUuid(id)) notFound()
  const { data: co } = await db().from('companies').select('id, company_name, verified').eq('id', id).maybeSingle()
  const company = co as { id: string; company_name: string; verified: boolean | null } | null
  if (!company) notFound()
  // 후기와 함께: 지금 모집 중인 공고 수 · 지원에 보통 얼마 만에 답하는지 (회사를 고를 때 한눈에)
  const [{ avg, count, recent }, openN, replyMin] = await Promise.all([
    companyReviews(id, 50),
    db()
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', id)
      .eq('audience', 'worker')
      .eq('status', 'open')
      .gte('end_date', kstDate())
      .then((r) => r.count ?? 0),
    replyMinutes(id).catch(() => null),
  ])
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, k: recent.filter((r) => r.rating === n).length }))
  // 정렬: 최신 · 별점 높은 · 별점 낮은 (같으면 최신 먼저)
  const shown = [...recent].sort((a, b) => (sort === 'high' ? b.rating - a.rating : sort === 'low' ? a.rating - b.rating : 0) || b.created_at.localeCompare(a.created_at))

  return (
    <div className="space-y-4">
      <Link href="/community?c=review" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 회사 후기
      </Link>
      <section className="card space-y-4" data-company-rating>
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-xl">
            🏢
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold">{company.company_name}</h1>
          </div>
          <Link href={`/?co=${company.id}`} className="shrink-0 text-sm font-semibold text-brand-600">
            공고 보기
          </Link>
        </div>
        {/* 회사를 고를 때 한눈에: 짧은 칩 한 줄 (확인된 회사 · 모집 중 n개 · 보통 n시간 내 답변) — 360px에서 한 줄에 들어가게 짧게 */}
        {(company.verified === true || openN > 0 || replyMin != null) && (
          <div className="-mt-1 flex flex-wrap gap-1.5" data-company-facts>
            {company.verified === true && <span className="badge bg-emerald-50 text-emerald-700">✓ 확인된 회사</span>}
            {openN > 0 && (
              <Link href={`/?co=${company.id}`} className="badge bg-brand-50 text-brand-700" data-company-open>
                모집 중 {openN}개
              </Link>
            )}
            {replyMin != null && (
              <span className="badge bg-bg text-sub" data-company-reply title="지원하면 결과를 알려 주기까지 보통 걸린 시간 (최근 90일)">
                보통 {replySpan(replyMin)} 내 답변
              </span>
            )}
          </div>
        )}
        {count > 0 && (
          <div className="flex items-center gap-5">
            <div className="shrink-0 text-center">
              <p className="text-4xl font-extrabold tabular-nums" data-avg>
                {avg.toFixed(1)}
              </p>
              <p className="text-sm text-amber-500" aria-hidden>
                {'★'.repeat(Math.round(avg))}
                <span className="text-line">{'★'.repeat(5 - Math.round(avg))}</span>
              </p>
              <p className="text-xs text-mute">후기 {count}개</p>
            </div>
            <ul className="min-w-0 flex-1 space-y-1">
              {dist.map(({ n, k }) => (
                <li key={n} className="flex items-center gap-2 text-xs text-mute">
                  <span className="w-3 shrink-0 tabular-nums">{n}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
                    <span className="block h-full origin-left animate-grow rounded-full bg-amber-400" style={{ width: `${recent.length ? (k / recent.length) * 100 : 0}%` }} />
                  </span>
                  <span className="w-5 shrink-0 text-right tabular-nums">{k}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {recent.length === 0 ? (
        <Empty icon="⭐" sticker="thanks" title="아직 후기가 없어요">
          이 회사에서 일했다면 <Link href="/me/history" className="font-semibold text-brand-600">지난 근무</Link>에서 첫 후기를 남겨 주세요.
        </Empty>
      ) : (
        <>
        {recent.length > 1 && (
          <nav aria-label="정렬" className="flex gap-2" data-review-sort>
            {(
              [
                ['new', '최신순'],
                ['high', '별점 높은순'],
                ['low', '별점 낮은순'],
              ] as const
            ).map(([k, label]) => (
              <Link
                key={k}
                href={k === 'new' ? `/community/company/${company.id}` : `/community/company/${company.id}?s=${k}`}
                aria-current={sort === k ? 'page' : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition active:scale-95 ${sort === k ? 'bg-ink text-white ring-ink' : 'bg-white text-sub ring-line'}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        <ul className="stagger space-y-2" data-review-list>
          {shown.map((r) => (
            <li key={r.id} className="card space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-amber-500" aria-label={`별점 ${r.rating}점`}>
                  {'★'.repeat(r.rating)}
                  <span className="text-line">{'★'.repeat(5 - r.rating)}</span>
                </span>
                <span className="text-xs text-mute">{ago(r.created_at)}</span>
              </div>
              <p className="text-[15px] whitespace-pre-wrap break-words">{r.body}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs text-mute">
                  {r.nick} · {r.jobTitle}
                </p>
                {r.author_id !== user.id && <ReportButton target="review" id={r.id} />}
              </div>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  )
}
