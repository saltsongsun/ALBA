import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import Icon from '@/components/Icon'
import Flash from '@/components/Flash'
import ProMode from '@/components/ProMode'
import JobCard from '@/components/JobCard'
import { countApps, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { MEMBER_TYPES } from '@/lib/members'
import { partnerCompanies, partnerPayments, partnerQuotes } from '@/lib/partners'
import LiveNumber from '@/components/LiveNumber'
import { PartnerShareCard } from '@/components/pro'
import { phoneFmt, won } from '@/lib/format'
import { getUser } from '@/lib/session'
import PhotoPrompt from '@/components/PhotoPrompt'
import PushNudge from '@/components/PushNudge'
import PushToggle from '@/components/PushToggle'
import { pushPublicKey } from '@/lib/push'
import { fmtDate, kstDate } from '@/lib/time'
import { DUE_TONE, payDue } from '@/lib/due'

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
  const [jobs, myApps, quotes, pays, photoAt, linked, hasAccount] = await Promise.all([
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
    // 전문가는 현장에서 알아볼 얼굴 사진이 필요 (외주 업체는 회사라 없음)
    type === 'expert' && user
      ? db()
          .from('users')
          .select('photo_at')
          .eq('id', user.id)
          .maybeSingle()
          .then((r) => (r.data as { photo_at: string | null } | null)?.photo_at ?? null)
      : 'n/a',
    // 외주 업체: 나를 외주사로 등록해 둔 회사 (없으면 회사에 알려 줄 번호를 보여 줌)
    vendor && user ? partnerCompanies(user.id) : [],
    // 대금 계좌를 넣었는지만 봄 (번호는 읽지 않음 · 못 읽으면 안내를 띄우지 않음) — 정기 개선 2026-11-22 16:35
    user && (vendor || type === 'expert')
      ? db()
          .from('users')
          .select('bank_account_enc')
          .eq('id', user.id)
          .maybeSingle()
          .then(
            (r) => (r.error ? true : !!(r.data as { bank_account_enc: string | null } | null)?.bank_account_enc),
            () => true,
          )
      : true,
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
          {/* 가입 유형: 이모지 대신 선 아이콘 (휴대폰마다 모양이 다르지 않게 · 정기 개선 2026-11-22 16:35) */}
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white/75" data-pro-kind>
            <Icon name={vendor ? 'building' : type === 'worker' ? 'smile' : 'sparkle'} />
            {type ? MEMBER_TYPES[type].label : '전문가 · 외주 업체'}
          </p>
          <h1 className="mt-1 text-2xl leading-tight font-extrabold">
            {user && type && type !== 'worker' ? (
              <>
                {user.name}님,
                <br />
                {/* 외주 업체: 지금 상황에 맞는 한 줄 (아직 어느 회사와도 안 이어졌으면 '확인하세요'가 아니라 무엇을 기다리는지) — 정기 개선 2026-11-22 18:35 */}
                {!vendor
                  ? '오늘도 좋은 무대 만들어요'
                  : toAnswer.length > 0
                    ? '받은 견적 요청을 확인하세요'
                    : linked.length === 0 && quotes.length === 0 && pays.length === 0
                      ? '회사와 이어지면 견적 요청이 와요'
                      : '새 견적 요청을 기다려요'}
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
              {/* 할 일이 있는 칸만 또렷하게: 0인 칸은 흐리게 (큰 '0건'·'0원'이 눈에 먼저 들어오지 않게) */}
              <Link
                href="/pro/money"
                className={`rounded-2xl px-4 py-3 backdrop-blur transition active:scale-95 ${toAnswer.length ? 'bg-white/12' : 'bg-white/[0.06]'}`}
                data-pro-tile="quotes"
                data-zero={toAnswer.length ? undefined : ''}
              >
                <span className="block text-xs font-semibold text-white/75">답할 견적</span>
                {/* 처음 열 때 0에서 짧게 올라감 ('움직임 줄이기'면 바로) */}
                <span className={`text-2xl font-extrabold ${toAnswer.length ? '' : 'text-white/45'}`}>
                  <LiveNumber value={toAnswer.length} countUp />건
                </span>
              </Link>
              <Link
                href="/pro/money#pay"
                className={`rounded-2xl px-4 py-3 backdrop-blur transition active:scale-95 ${unpaidSum ? 'bg-white/12' : 'bg-white/[0.06]'}`}
                data-pro-tile="pay"
                data-zero={unpaidSum ? undefined : ''}
              >
                <span className="block text-xs font-semibold text-white/75">받을 대금</span>
                <span className={`text-lg font-extrabold whitespace-nowrap ${unpaidSum ? '' : 'text-white/45'}`}>
                  <LiveNumber value={unpaidSum} countUp />원
                </span>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 대금 계좌가 비어 있으면 (전문가·외주 업체): 회사가 대금을 보내려면 꼭 필요해서 홈 맨 위에 한 줄
          받을 대금이 있으면 빨간 말로 · 누르면 내 정보의 계좌 칸으로 (정기 개선 2026-11-22 16:35) */}
      {user && (vendor || type === 'expert') && !hasAccount && (
        <Link href="/me/profile#bank_account" className="card-link flex animate-pop items-center gap-3 p-4" data-pro-account={unpaidSum ? 'due' : ''}>
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-rose-50 text-lg text-rose-600">
            <Icon name="card" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">대금 계좌를 등록해 주세요</span>
            {/* 금액은 바로 위 '받을 대금' 칸에 크게 있어서 여기선 말로만 (같은 숫자를 두 번 쓰지 않게) */}
            <span className={`block truncate text-sm ${unpaidSum ? 'font-semibold text-rose-600' : 'text-sub'}`}>
              {unpaidSum ? '받을 대금이 계좌를 기다려요' : '회사가 대금을 바로 보낼 수 있어요'}
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold whitespace-nowrap text-brand-600">등록 →</span>
        </Link>
      )}

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
          <h2 className="section-title">
            <Icon name="file" className="text-brand-600" /> 답할 견적 요청
          </h2>
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
            <div className="space-y-2">
              <Empty icon="🎛️" title="지금 모집 중인 전문가 의뢰가 없어요">
                새 의뢰가 올라오면 여기에 보여요.
              </Empty>
              {/* 의뢰가 없는 날 그냥 나가지 않게: 알림을 안 켠 전문가에게 바로 켜는 카드 (근무자 홈과 같음 · 켰으면 안 보임) */}
              {user && type === 'expert' && <PushToggle publicKey={pushPublicKey()} variant="card" reason="새 의뢰·확정을 바로 알려요" />}
            </div>
          ) : (
            <div className="stagger space-y-3">
              {jobs.map((j) => (
                <JobCard key={j.id} job={j} approved={counts[j.id] ?? 0} myStatus={mine.get(j.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 답할 견적이 없을 때: 아직 이어진 회사가 없으면 회사에 알려 줄 번호 · 있으면 어느 회사에 등록됐는지
          받을 대금이 있으면 큰 빈 카드 대신 대금 아래 한 줄로 (늦은 대금이 첫 화면 위에 오게 · 정기 개선 2026-11-24 03:35) */}
      {vendor &&
        user &&
        toAnswer.length === 0 &&
        !(linked.length > 0 && unpaid.length > 0) &&
        (linked.length === 0 ? (
          <PartnerShareCard name={user.name} phone={phoneFmt(user.phone)} />
        ) : (
          <Empty icon="📄" title="답할 견적 요청이 없어요">
            <span className="block" data-partner-linked={linked.length}>
              {linked.length}개 회사에 외주사로 등록돼 있어요 · {linked.slice(0, 3).join(', ')}
              {linked.length > 3 && ` 외 ${linked.length - 3}곳`}
            </span>
            견적을 요청하면 여기와 휴대폰 알림으로 알려 드려요.
          </Empty>
        ))}

      {user && unpaid.length > 0 && (
        <section>
          <h2 className="section-title">
            <Icon name="card" className="text-brand-600" /> 받을 대금
          </h2>
          <div className="card divide-y divide-line py-1">
            {unpaid.slice(0, 4).map((p) => {
              // 늦은 대금이 바로 눈에 띄게: 오른쪽 금액 아래 'n일 지남' · '오늘 지급' · 'D-n'
              const due = payDue(p.due_date, p.paid_at, today)
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3" data-pay-row={p.title}>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-mute">{p.company}</span>
                    <span className="block truncate font-semibold">{p.title}</span>
                    <span className={`block text-xs ${due.tone === 'late' ? 'font-semibold text-rose-600' : 'text-sub'}`}>{p.due_date ? `지급 예정 ${fmtDate(p.due_date)}` : '지급일 협의 중'}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-extrabold whitespace-nowrap tabular-nums">{won(p.amount)}</span>
                    <span className={`badge tabular-nums ${DUE_TONE[due.tone]}`} data-pay-due={due.tone}>
                      {due.label}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
          <Link href="/pro/money#pay" className="mt-2 inline-block text-sm font-semibold text-brand-600">
            대금 전체 보기 →
          </Link>
        </section>
      )}
      {vendor && user && toAnswer.length === 0 && linked.length > 0 && unpaid.length > 0 && (
        <p className="flex animate-[rise_0.25s_var(--ease-spring)_both] items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-line" data-quote-none="home">
          <Icon name="file" className="shrink-0 text-mute" />
          <span className="min-w-0 flex-1 truncate font-semibold text-sub">답할 견적 요청이 없어요</span>
          <span className="shrink-0 text-xs whitespace-nowrap text-mute">등록된 회사 {linked.length}곳</span>
        </p>
      )}
      {/* 얼굴 사진이 없는 전문가는 등록 창, 그다음 알림 켜기 권유 */}
      {user && type === 'expert' && !photoAt && <PhotoPrompt userId={user.id} name={user.name} />}
      {user && (type === 'expert' || vendor) && (
        <PushNudge publicKey={pushPublicKey()} pro reason={vendor ? '견적 요청과 대금 지급을 바로 알려 드려요' : '새 의뢰와 확정 소식을 바로 알려 드려요'} />
      )}
    </div>
  )
}
