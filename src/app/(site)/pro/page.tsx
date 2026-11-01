import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import ProMode from '@/components/ProMode'
import JobCard from '@/components/JobCard'
import { countApps, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { MEMBER_TYPES } from '@/lib/members'
import { partnerPayments, partnerQuotes } from '@/lib/partners'
import { getUser } from '@/lib/session'
import { fmtDate, kstDate } from '@/lib/time'

export const metadata: Metadata = { title: '전문가·외주 파트너' }

/**
 * 전문가·외주 업체 홈 (아르바이트 화면과 따로, 보라색).
 * 전문가: 모집 중인 전문가 의뢰 + 답할 견적 요청 / 외주 업체: 답할 견적 요청 + 대금 현황
 * 로그인 전이면 소개와 가입 안내
 */
export default async function ProHome(props: PageProps<'/pro'>) {
  const sp = await props.searchParams
  const user = await getUser()
  const today = kstDate()
  const type = user && user.role !== 'admin' ? user.memberType : null
  const vendor = type === 'vendor'
  const [jobs, myApps, quotes, pays] = await Promise.all([
    vendor
      ? []
      : db()
          .from('jobs')
          .select(JOB_WITH_APP_STATUS)
          .eq('audience', 'expert')
          .in('status', ['open', 'closed'])
          .gte('end_date', today)
          .order('start_date')
          .limit(50)
          .then((r) => (must(r) as JobWithAppStatus[]).filter((j) => j.end_date >= today && ['open', 'closed'].includes(j.status))),
    user
      ? db()
          .from('applications')
          .select('job_id, status')
          .eq('user_id', user.id)
          .then((r) => must(r) as { job_id: string; status: string }[])
      : [],
    user ? partnerQuotes(user.id) : [],
    user ? partnerPayments(user.id) : [],
  ])
  const counts = countApps(jobs, 'approved')
  const mine = new Map(myApps.map((a) => [a.job_id, a.status]))
  const toAnswer = quotes.filter((q) => q.request?.status === 'open' && (q.status === 'requested' || q.status === 'submitted'))
  const unpaid = pays.filter((p) => !p.paid_at)
  const unpaidSum = unpaid.reduce((n, p) => n + p.amount, 0)

  return (
    <div className="space-y-5" data-mode="pro">
      <ProMode />
      <Flash m={sp.m} />
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2a1b5e] via-[#3b2385] to-brand-600 p-6 text-white shadow-lg shadow-brand-600/25">
        <span aria-hidden className="pointer-events-none absolute -top-14 -right-12 size-48 animate-float rounded-full bg-white/10" />
        <span aria-hidden className="pointer-events-none absolute right-16 -bottom-16 size-28 animate-float rounded-full bg-white/5 [animation-delay:1.2s]" />
        <div className="relative">
          <p className="text-sm font-semibold text-white/75">{type ? `${MEMBER_TYPES[type].emoji} ${MEMBER_TYPES[type].label}` : '🎛️ 전문가 · 🏢 외주 업체'}</p>
          <h1 className="mt-1 text-2xl leading-tight font-extrabold">
            {user && type && type !== 'worker' ? (
              <>
                {user.name}님,
                <br />
                {vendor ? '받은 견적 요청을 확인하세요' : '오늘도 좋은 무대 만들어요'}
              </>
            ) : (
              <>
                행사 전문가·외주 업체를 위한
                <br />
                의뢰 · 견적 · 대금 관리
              </>
            )}
          </h1>
          {!user && (
            <>
              <p className="mt-2 text-sm text-white/85">음향·조명·영상·MC 같은 전문 인력과 장비·설치 업체는 여기서 의뢰를 받고 대금을 확인해요.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href="/signup?type=expert" className="btn bg-white text-brand-700">
                  🎛️ 전문가 가입
                </Link>
                <Link href="/signup?type=vendor" className="btn bg-white/15 text-white">
                  🏢 업체 가입
                </Link>
              </div>
              <Link href="/login?next=/pro" className="mt-3 inline-block text-sm font-semibold text-white/85 underline">
                이미 가입했어요 · 로그인
              </Link>
            </>
          )}
          {user && type && type !== 'worker' && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/pro/money" className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur transition active:scale-95">
                <span className="block text-xs font-semibold text-white/75">답할 견적</span>
                <span className="text-2xl font-extrabold tabular-nums">{toAnswer.length}건</span>
              </Link>
              <Link href="/pro/money#pay" className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur transition active:scale-95">
                <span className="block text-xs font-semibold text-white/75">받을 대금</span>
                <span className="text-lg font-extrabold whitespace-nowrap tabular-nums">{won(unpaidSum)}</span>
              </Link>
            </div>
          )}
        </div>
      </section>

      {user?.role !== 'admin' && type === 'worker' && (
        <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          지금은 아르바이트 회원이에요. 전문가 의뢰에 지원하려면{' '}
          <Link href="/me/profile#type" className="font-bold underline">
            내 정보에서 전문가로 바꿔 주세요
          </Link>
          .
        </p>
      )}

      {toAnswer.length > 0 && (
        <section>
          <h2 className="section-title">📄 답할 견적 요청</h2>
          <div className="stagger space-y-2">
            {toAnswer.slice(0, 5).map((q) => (
              <Link key={q.id} href={`/quote/${q.token}`} className="card-link flex items-center justify-between gap-3 p-4">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-mute">{q.company}</span>
                  <span className="block font-bold">{q.request?.title}</span>
                  <span className="block text-sm text-sub">
                    {q.request?.due_date ? `마감 ${fmtDate(q.request.due_date)}` : '마감일 없음'}
                    {q.status === 'submitted' && q.amount != null && ` · 보낸 견적 ${won(q.amount)}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold whitespace-nowrap text-brand-600">{q.status === 'submitted' ? '고치기 →' : '견적 내기 →'}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!vendor && (
        <section>
          <h2 className="section-title">
            모집 중인 전문가 의뢰 {jobs.length > 0 && <span className="text-brand-600">{jobs.length}</span>}
          </h2>
          {jobs.length === 0 ? (
            <Empty icon="🎛️" title="지금 모집 중인 전문가 의뢰가 없어요">
              새 의뢰가 올라오면 여기에 보여요.
            </Empty>
          ) : (
            <div className="stagger space-y-3">
              {jobs.map((j) => (
                <JobCard key={j.id} job={j} approved={counts[j.id] ?? 0} myStatus={mine.get(j.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {vendor && toAnswer.length === 0 && (
        <Empty icon="📄" title="아직 받은 견적 요청이 없어요">
          회사가 이 번호나 사업자등록번호로 외주사를 등록해 두면 견적 요청이 앱으로 와요.
        </Empty>
      )}

      {user && unpaid.length > 0 && (
        <section>
          <h2 className="section-title">💸 받을 대금</h2>
          <div className="card divide-y divide-line py-1">
            {unpaid.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-mute">{p.company}</span>
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="block text-xs text-sub">{p.due_date ? `지급 예정 ${fmtDate(p.due_date)}` : '지급일 협의 중'}</span>
                </span>
                <span className="shrink-0 font-extrabold whitespace-nowrap tabular-nums">{won(p.amount)}</span>
              </div>
            ))}
          </div>
          <Link href="/pro/money#pay" className="mt-2 inline-block text-sm font-semibold text-brand-600">
            대금 전체 보기 →
          </Link>
        </section>
      )}
    </div>
  )
}
