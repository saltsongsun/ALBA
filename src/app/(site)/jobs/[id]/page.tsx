import type { Metadata } from 'next'
import LiveNumber from '@/components/LiveNumber'
import SlotBar from '@/components/SlotBar'
import Icon from '@/components/Icon'
import Link from 'next/link'
import { WorkerIdentityForm } from '@/components/AuthForms'
import { notFound } from 'next/navigation'
import { applyJob, cancelApplication, changeDates } from '@/app/actions/worker'
import { ContactButtons } from '@/components/Contact'
import Flash from '@/components/Flash'
import MessageChips from '@/components/MessageChips'
import JobCard, { APP_STATUS, wageBadge } from '@/components/JobCard'
import StickyApply from '@/components/StickyApply'
import PhotoDoneNote from '@/components/PhotoDoneNote'
import { PHOTO_DONE_KEY } from '@/lib/photoDone'
import { ConfirmSubmit, ShareButton, SubmitButton } from '@/components/ui'
import VenueMap from '@/components/VenueMap'
import { approvedCounts, countApps, getJob, getSettings, JOB_WITH_APP_STATUS, replyMinutes, replySpan, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { overlapDay } from '@/lib/overlap'
import { scheduleSummary, scheduleText } from '@/lib/docs'
import { phoneFmt, won } from '@/lib/format'
import { shows } from '@/lib/jobFields'
import { breakDescription, estimateDay, TAX_LABEL, workOver } from '@/lib/pay'
import { adminCompanies, getUser } from '@/lib/session'
import { dateList, fmtDate, fmtDateRange, hhmm, kstAt, kstDate, minutesText } from '@/lib/time'
import type { Application, Job } from '@/lib/types'
import { isUuid } from '@/lib/validate'
import JobViewBeacon from '@/components/JobViewBeacon'
import ApplySteps from '@/components/ApplySteps'
import ApplyDays from '@/components/ApplyDays'
import { canApplyTo, contractNameOf } from '@/lib/members'
import ProMode from '@/components/ProMode'
import PhotoPrompt from '@/components/PhotoPrompt'
import PhotoUpload from '@/components/PhotoUpload'
import PushNudge from '@/components/PushNudge'
import PushToggle from '@/components/PushToggle'
import { pushPublicKey } from '@/lib/push'
import { ago, companyReviews } from '@/lib/community'
import { featureOn } from '@/lib/flags'
import { coworkersOnJob } from '@/lib/coworkers'

async function load(id: string) {
  return isUuid(id) ? getJob(id) : null
}

export async function generateMetadata(props: PageProps<'/jobs/[id]'>): Promise<Metadata> {
  const { id } = await props.params
  const job = await load(id)
  if (!job || job.status === 'draft') return { title: '공고' }
  // 장소가 비어 있으면 빼고 이어 붙임 (카카오톡 미리보기에 '· ·'가 찍히지 않게)
  const description = [scheduleSummary(job), job.location_name, wageBadge(job)].filter(Boolean).join(' · ')
  return {
    title: job.title,
    description,
    openGraph: { title: job.title, description, type: 'website' },
  }
}

const CANCEL_REASONS = ['일정이 생겼어요', '몸이 아파요', '교통·거리 문제', '다른 일을 하게 됐어요', '기타']

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-16 shrink-0 text-sm leading-snug font-semibold text-mute">{k}</dt>
      <dd className="min-w-0 flex-1 text-[15px] leading-snug whitespace-pre-wrap">{children}</dd>
    </div>
  )
}

export default async function JobPage(props: PageProps<'/jobs/[id]'>) {
  const { id } = await props.params
  const sp = await props.searchParams
  const [job, user] = await Promise.all([load(id), getUser()])
  if (!job || job.status === 'draft') notFound()

  // 날짜가 가까운 다른 모집 공고 3개 (공고 종류만 알면 되니 아래와 함께 읽음)
  const othersP = db()
    .from('jobs')
    .select(JOB_WITH_APP_STATUS)
    .eq('audience', job.audience)
    .eq('status', 'open')
    .gte('end_date', kstDate())
    .neq('id', job.id)
    .order('start_date')
    .limit(3)
    .then((r) => (must(r) as JobWithAppStatus[]).filter((j) => j.id !== job.id && j.status === 'open' && j.end_date >= kstDate()))
  const [counts, app, docs, mine, pendingIds, company, me, coInfo, others] = await Promise.all([
    approvedCounts([job.id]),
    user
      ? db().from('applications').select('*').eq('job_id', job.id).eq('user_id', user.id).maybeSingle().then((r) => r.data as Application | null)
      : null,
    job.required_docs.length
      ? db()
          .from('doc_templates')
          .select('id, title, kind')
          .in('id', job.required_docs)
          .then((r) => (must(r) as { id: string; title: string; kind: string }[]).filter((d) => job.contract_method === 'app' || d.kind !== 'contract'))
      : [],
    // 내가 확정·지원한 다른 근무 (같은 날 같은 시간에 겹치는지 보려고)
    user
      ? db()
          .from('applications')
          .select('status, available_dates, job:jobs(id, title, start_date, end_date, start_time, end_time, status)')
          .eq('user_id', user.id)
          .in('status', ['approved', 'applied'])
          .neq('job_id', job.id)
          .then(
            (r) =>
              (r.data ?? []) as unknown as {
                status: string
                available_dates: string[] | null
                job: Pick<Job, 'id' | 'title' | 'start_date' | 'end_date' | 'start_time' | 'end_time' | 'status'> | null
              }[],
          )
      : [],
    // 이 공고에서 아직 서명 안 한 내 서류 (진행 단계 표시 + '서류 서명하기' 버튼으로 첫 서류 바로 열기)
    user
      ? db()
          .from('signed_docs')
          .select('id, created_at')
          .eq('job_id', job.id)
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .limit(20)
          .then((r) => ((r.data ?? []) as { id: string; created_at: string }[]).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((d) => d.id))
      : ([] as string[]),
    // 공고를 낸 회사 (여러 회사가 함께 씀)
    getSettings(job.company_id),
    // 얼굴 사진 (없으면 지원 전에 올리게) · 급여 계좌가 있는지 (지원·확정 뒤 등록 안내)
    user
      ? db()
          .from('users')
          .select('photo_at, bank_account_enc, rrn_masked')
          .eq('id', user.id)
          .maybeSingle()
          .then((r) => r.data as { photo_at: string | null; bank_account_enc: string | null; rrn_masked: string | null } | null)
      : null,
    // 회사: 해피워크가 확인한 회사인지 + 지금 모집 중인 공고 수 (그 회사 공고 모음으로)
    Promise.all([
      db().from('companies').select('verified').eq('id', job.company_id).maybeSingle(),
      db()
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', job.company_id)
        .eq('audience', 'worker')
        .eq('status', 'open')
        .gte('end_date', kstDate()),
      // 근무자 후기 평균 별점 (가입한 회원에게만)
      // 운영자가 '공고에 회사 후기 보이기'를 끄면 안 읽음 (별점·최근 후기 숨김)
      user ? featureOn('job_reviews').then((on) => (on ? companyReviews(job.company_id, 1).catch(() => null) : null)) : null,
      // 이 공고에 지원·확정된 동료 중 나에게 지원을 보여 주기로 한 사람만 (별명)
      user ? coworkersOnJob(user.id, job.id) : [],
    ]).then(([c, n, rv, pals]) => ({
      verified: (c.data as { verified?: boolean | null } | null)?.verified === true,
      open: n.count ?? 0,
      rating: rv && rv.count > 0 ? { avg: rv.avg, count: rv.count } : null,
      latest: rv?.recent[0] ?? null,
      pals,
    })),
    othersP,
  ])
  const otherCounts = countApps(others, 'approved')
  const approved = counts[job.id] ?? 0
  const unsignedHere = pendingIds.length > 0
  const est = estimateDay(job)
  const dates = dateList(job.start_date, job.end_date)
  const ended = job.end_date < kstDate()
  // 마지막 날 근무 시간까지 끝났으면 (오늘 끝난 근무) 더 지원받지 않음 — 끝난 근무에 지원하는 실수 막기
  const overToday = !ended && job.status === 'open' && workOver(job, job.end_date)
  const canApply = job.status === 'open' && !ended && !overToday
  // 하루짜리 근무가 이미 시작했으면 지원 칸에 한 줄 안내 (지원은 받음: 급히 사람을 구하는 경우)
  const startedToday = canApply && job.start_date === job.end_date && job.start_date === kstDate() && Date.now() >= kstAt(job.start_date, job.start_time).getTime()
  // 오늘 3시간 안에 시작하는 근무: 지원 칸에 '곧 시작' 한 줄 (늦지 않게 갈 수 있을 때만 지원하게 — 지각·노쇼 막기)
  const soonMin = canApply && job.start_date === kstDate() ? Math.ceil((kstAt(job.start_date, job.start_time).getTime() - Date.now()) / 60_000) : 0
  const startsSoon = soonMin > 0 && soonMin <= 180
  const path = `/jobs/${job.id}`
  // 전문가 의뢰는 전문가 화면(보라)·말투로, 지원도 가입 유형이 맞아야 (알바 공고는 알바, 전문가 의뢰는 전문가)
  const expert = job.audience === 'expert'
  // 얼굴 사진이 없는 근무자·전문가 (현장 담당자가 알아볼 수 있게 지원 전에 등록)
  const photoAt = me?.photo_at ?? null
  // 관리자 계정 (한 계정으로 두 역할): 맡은 회사 공고는 관리자 화면에서 · 다른 회사 공고는 근무자로 지원 (처음 한 번 근무자 정보)
  const ownJob = user?.role === 'admin' && (user.isSuper || (await adminCompanies(user.id, false)).some((c) => c.id === job.company_id))
  const asWorker = !!user && (user.role === 'worker' || !ownJob)
  const needPhoto = !!user && asWorker && user.memberType !== 'vendor' && !photoAt
  const needIdentity = !!user && user.role === 'admin' && !ownJob && !me?.rrn_masked
  const wrongType = !!user && asWorker && !canApplyTo(user.memberType, job.audience)
  const activeApp = !!app && (app.status === 'applied' || app.status === 'approved') && !ended
  // 지원하고 기다리는 중이면: 이 회사가 보통 얼마 만에 답하는지 (회사마다 달라서 · 기록이 적으면 안 보임)
  // 확정 근무를 24시간 안에(또는 이미 시작한 날) 취소하려 하면: 남은 시간 + 담당자 전화 (취소 칸 위에)
  const nextDay = app?.status === 'approved' ? (app.available_dates ?? dates).filter((d) => d >= kstDate()).sort()[0] : undefined
  const untilMin = nextDay ? Math.round((kstAt(nextDay, job.start_time).getTime() - Date.now()) / 60_000) : null
  const soonCancel =
    untilMin != null && untilMin <= 24 * 60
      ? {
          left: untilMin > 0 ? `시작까지 ${minutesText(untilMin)} 남았어요` : '오늘 이미 시작한 근무예요',
          phone: job.manager_phone || company.contact_phone || company.company_phone || null,
        }
      : null
  const replyMin = app?.status === 'applied' && !ended && job.status !== 'cancelled' ? await replyMinutes(job.company_id).catch(() => null) : null
  // 아직 지원 전이면 겹치는 근무를 미리 알려 줌 (지원은 막지 않음: 여러 날 행사는 날짜를 골라 지원할 수 있어서)
  const clashes =
    canApply && (!app || app.status === 'cancelled')
      ? mine
          .filter((m) => m.job && m.job.end_date >= kstDate() && m.job.status !== 'cancelled')
          .map((m) => ({ m, at: overlapDay(job, { ...m.job!, dates: m.available_dates }) }))
          .filter((x): x is { m: (typeof mine)[number]; at: string } => !!x.at)
      : []

  // 급여 자세히 (돈 칸 안에 접어 둠)
  const payMore = (
    [
      shows(job, 'break') && ['휴게', breakDescription(job)],
      // 시급 공고가 분 단위로 다 쳐 주지 않으면 미리 알려 줌 (지원 전에 알 수 있게)
      job.pay_type === 'hourly' && job.round_unit > 1 && ['계산', `${job.round_unit}분 단위 (${job.round_unit}분 미만은 빼요)`],
      job.allowance > 0 && ['수당', `${job.allowance_label || '수당'} 1일 ${won(job.allowance)}`],
      job.premium_enabled && shows(job, 'premium') && ['가산', '8시간 초과·야간(22~06시) 근무 50% 가산'],
      shows(job, 'tax') && ['공제', `${TAX_LABEL[job.tax_type]}${job.tax_type === 'daily' && job.employment_insurance ? ' · 고용보험 0.9%' : ''}`],
      job.pay_day && shows(job, 'pay_day') && ['지급일', job.pay_day],
    ] as (false | null | undefined | '' | [string, string])[]
  ).filter((x): x is [string, string] => !!x)

  return (
    <div data-mode={expert ? 'pro' : undefined}>
      {expert && <ProMode />}
      <Flash m={sp.m} />
      {/* 공고 링크로 가입한 직후: 가입이 끝났고 아직 지원은 안 됐다고 분명히 (지원 버튼을 가입 마지막 단계로 착각하지 않게) */}
      {sp.joined === '1' && user && (!app || app.status === 'cancelled') && (
        <div className="mb-3 animate-pop rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200/70">
          <p className="font-bold text-emerald-800">🎉 가입이 끝났어요</p>
          <p className="mt-1 text-sm text-emerald-900">
            아직 이 {expert ? '의뢰' : '공고'}에 <b>지원하지 않았어요.</b> 내용을 보고 함께하고 싶을 때만 아래 지원 버튼을 눌러 주세요.
          </p>
        </div>
      )}
      {job.status === 'cancelled' && (
        <div className="mb-3 animate-pop rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200/70">
          <p className="font-bold text-rose-700">❌ 취소된 행사예요</p>
          <p className="mt-1 text-sm text-rose-900">
            {app ? '지원·확정은 모두 취소됐어요. 사유는 문의함에서 볼 수 있어요.' : '이 행사는 열리지 않아요. 다른 모집 공고를 확인해 주세요.'}
          </p>
          <Link href={app ? '/me/chat' : '/'} className="btn-gray btn-sm mt-3">
            {app ? '문의함 보기' : '모집 중인 알바 보기'}
          </Link>
        </div>
      )}
      <div className="card">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {expert && <span className="badge bg-ink text-white">🎛️ 전문가 의뢰</span>}
          {canApply ? (
            <span className="badge bg-brand-50 text-brand-700">{expert ? '지원 받는 중' : '모집중'}</span>
          ) : overToday ? (
            <span className="badge bg-gray-100 text-mute" data-over-today>
              오늘 {expert ? '일정' : '근무'} 종료
            </span>
          ) : job.status === 'cancelled' ? (
            <span className="badge bg-rose-50 text-rose-600">행사 취소</span>
          ) : (
            <span className="badge bg-gray-100 text-mute">마감</span>
          )}
          {app && APP_STATUS[app.status] && <span className={`badge ${APP_STATUS[app.status].cls}`}>{APP_STATUS[app.status].label}</span>}
          {job.event_name && <span className="text-xs font-semibold text-mute">{job.event_name}</span>}
        </div>
        <h1 className="text-[22px] leading-snug font-extrabold">{job.title}</h1>
        {expert ? (
          <p className="mt-1 text-sm font-semibold text-sub">🏢 {company.company_name}</p>
        ) : (
          // 회사 이름을 누르면 그 회사 공고만 모아 보기
          <Link href={`/?co=${job.company_id}`} className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-sub" data-company-line>
            <span className="min-w-0 truncate">🏢 {company.company_name}</span>
            {coInfo.verified && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">✓ 확인된 회사</span>}
            {coInfo.open > 0 && <span className="ml-auto shrink-0 text-xs text-brand-600">공고 {coInfo.open}개 →</span>}
          </Link>
        )}
        {/* 근무자 후기 별점: 누르면 그 회사 후기 모두 */}
        {!expert && coInfo.rating && (
          <Link href={`/community/company/${job.company_id}`} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-amber-600" data-company-rating-badge>
            <span aria-hidden>★</span>
            <span className="tabular-nums">{coInfo.rating.avg.toFixed(1)}</span>
            <span className="font-normal text-mute">· 근무자 후기 {coInfo.rating.count}개 →</span>
          </Link>
        )}
        {/* 가장 최근 후기 한 줄 미리보기 (일한 근무자가 별명으로 남긴 것) */}
        {!expert && coInfo.latest && (
          <Link href={`/community/company/${job.company_id}`} className="mt-1.5 block rounded-xl bg-amber-50/70 px-3 py-2 text-sm transition active:scale-[0.99]" data-review-preview>
            <span className="line-clamp-2 text-ink">
              <b className="text-amber-500">{'★'.repeat(coInfo.latest.rating)}</b> &ldquo;{coInfo.latest.body}&rdquo;
            </span>
            <span className="block text-xs text-mute">
              {coInfo.latest.nick} · {ago(coInfo.latest.created_at)}
            </span>
          </Link>
        )}
        {/* 함께 일했던 동료도 지원했으면 (그 사람이 나에게 보여 주기로 한 경우만) */}
        {coInfo.pals.length > 0 && (
          <p className="mt-2 flex animate-pop items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700" data-coworkers-on-job>
            <span aria-hidden>🤝</span>
            <span className="min-w-0 truncate">
              동료 {coInfo.pals.length}명도 지원했어요 · {coInfo.pals.slice(0, 3).join(', ')}
              {coInfo.pals.length > 3 && ` 외 ${coInfo.pals.length - 3}명`}
            </span>
          </p>
        )}
        <div data-wage-box className="mt-4 animate-pop rounded-[20px] bg-brand-50 p-4 [animation-delay:120ms]">
          {shows(job, 'estimate') ? (
            <>
              <p className="text-sm text-sub">
                {wageBadge(job)}
                {expert && ' · 용역 대금'}
              </p>
              {/* 처음 열면 0에서 금액까지 빠르게 올라감 ('움직임 줄이기' 설정이면 바로) */}
              <p className="mt-0.5 text-2xl font-extrabold" data-day-est>
                하루 약 <LiveNumber value={est.gross} countUp />원
              </p>
              <p className="mt-1 text-xs text-mute">
                <span className="whitespace-nowrap">{scheduleText(job)} 기준</span> · <span className="whitespace-nowrap">휴게 {est.breakMin}분 제외</span>{' '}
                <span className="whitespace-nowrap">{minutesText(est.paidMin)} · 세전</span>
                {expert && (
                  <>
                    {' '}
                    · <span className="whitespace-nowrap">사업소득 3.3% 떼고 약 {won(Math.round(est.gross * 0.967))}</span>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="text-2xl font-extrabold">{wageBadge(job)}</p>
          )}
          {/* 급여 자세히: 휴게·수당·가산·공제·지급일은 접어 둠 (한눈에 보는 칸은 짧게) */}
          {payMore.length > 0 && (
            <details className="group mt-2 border-t border-brand-100/70 pt-2" data-pay-more>
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">
                {/* 펼침 표시는 앞의 화살표 하나만 (뒤에 ⌄까지 있어 두 개였음) */}
                {payMore.map(([k]) => k).join(' · ')} 자세히
              </summary>
              <dl className="mt-2 space-y-1 text-[13px] leading-snug">
                {payMore.map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="w-12 shrink-0 font-semibold text-mute">{k}</dt>
                    <dd className="min-w-0 flex-1 text-sub">{v}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
        <dl className="mt-3 divide-y divide-line">
          <Row k="일정">
            {fmtDateRange(job.start_date, job.end_date)}
            {'\n'}
            {scheduleText(job)}
          </Row>
          {(job.location_name || job.address) && (
            <Row k="장소">
              {[job.location_name, job.address].filter(Boolean).join('\n')}
              {/* 지도는 설명 아래 멀리 있어서: 장소 옆에서 바로 내려가기 */}
              {' '}
              <a href="#venue" className="text-sm font-semibold whitespace-nowrap text-brand-600" data-venue-link>
                지도 ↓
              </a>
              {/* 모이는 곳은 장소 아래 작은 글씨로 (따로 한 줄을 차지하지 않게) */}
              {job.meeting_point && (
                <span className="mt-1 block rounded-lg bg-bg px-2.5 py-1.5 text-[13px] text-sub" data-meeting-point>
                  <b className="font-semibold text-ink">모이는 곳</b> · {job.meeting_point}
                </span>
              )}
            </Row>
          )}
          {!(job.location_name || job.address) && job.meeting_point && <Row k="집결">{job.meeting_point}</Row>}
          {shows(job, 'headcount') && (
            <Row k="인원">
              {job.headcount}명 모집 · {approved}명 확정
              {/* 모집 인원만큼 칸 (확정된 만큼 참) */}
              <SlotBar value={approved} max={job.headcount} color={approved >= job.headcount ? 'bg-mute' : 'bg-brand-500'} height="h-1.5" className="mt-1.5 max-w-60" overflow={false} />
            </Row>
          )}
          {job.task && <Row k="업무">{job.task}</Row>}
          {job.dress_code && <Row k="복장">{job.dress_code}</Row>}
          {job.supplies && <Row k="준비물">{job.supplies}</Row>}
          {job.conditions.map((c, i) => (
            <Row key={i} k={c.label}>
              {c.value}
            </Row>
          ))}
          {job.manager_name && (
            <Row k="담당자">
              {/* 담당자 휴대폰은 로그인한 회원에게만 (검색에 노출되거나 누구나 모아 가지 못하게) */}
              {job.manager_phone && user ? (
                // 이름·번호 한 줄 + 전화·문자 (넓으면 옆에, 좁으면 아래 한 줄 — '문자'만 따로 떨어지지 않게)
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5" data-manager-contact>
                  <span className="whitespace-nowrap">
                    {job.manager_name} <span className="text-sub tabular-nums">{phoneFmt(job.manager_phone)}</span>
                  </span>
                  <ContactButtons phone={job.manager_phone} name={`담당자 ${job.manager_name ?? ''}`.trim()} showNumber={false} />
                </div>
              ) : (
                job.manager_name
              )}
            </Row>
          )}
          {(docs.length > 0 || job.contract_method !== 'app') && shows(job, 'docs') && (
            <Row k="서류">
              {/* 서류 이름 아래 작은 글씨로 받는 방법 (괄호가 줄 중간에서 끊기지 않게) */}
              <span className="block space-y-1.5" data-doc-lines>
                {(
                  [
                    job.contract_method === 'paper' && [contractNameOf(job.audience), '현장에서 종이로 작성'],
                    job.contract_method === 'external' && [contractNameOf(job.audience), '모두싸인 등 전자계약'],
                    docs.length > 0 && [docs.map((d) => d.title).join(', '), '확정 후 앱에서 전자서명'],
                  ].filter(Boolean) as [string, string][]
                ).map(([name, how]) => (
                  <span key={name} className="block">
                    {name}
                    <span className="block text-xs text-sub">{how}</span>
                  </span>
                ))}
              </span>
            </Row>
          )}
        </dl>
        {job.description && <p className="mt-3 rounded-xl bg-bg p-4 text-[15px] whitespace-pre-wrap text-sub">{job.description}</p>}
        {(job.location_name || job.address || job.lat != null) && (
          <div id="venue" className="mt-4 scroll-mt-24 rounded-2xl" data-target-flash>
            <h2 className="mb-2 text-sm font-bold text-sub">찾아오는 길</h2>
            <VenueMap name={job.location_name} address={job.address} lat={job.lat} lng={job.lng} />
          </div>
        )}
      </div>

      {/* 아직 지원 전이면 휴대폰 아래에 지원 버튼을 띄움 (지원 칸이 화면 아래쪽이라) */}
      {/* 관리자 조회 현황용 신호 (관리자 본인은 세지 않음) */}
      <JobViewBeacon jobId={job.id} />
      {canApply && !ownJob && (!app || app.status === 'cancelled') && (
        <StickyApply
          targetId="apply"
          title={job.title}
          summary={shows(job, 'estimate') ? `하루 약 ${won(est.gross)}` : wageBadge(job)}
          href={user ? undefined : `/signup?next=${encodeURIComponent(path)}`}
          aboveTabs={!!user}
          // 얼굴 사진이 없으면 아래 칸이 '사진 올리기'라서, 바도 그대로 말해 줌 (눌렀는데 지원이 아니라 놀라지 않게)
          note={needPhoto ? '지원 전에 얼굴 사진 1장이 필요해요' : needIdentity ? '처음 한 번 근무자 정보가 필요해요' : undefined}
          cta={needPhoto ? '사진 올리고 지원' : needIdentity ? '정보 넣고 지원' : undefined}
        />
      )}
      {/* 확정됐는데 서명이 남았으면: 화면 아래 바에서 바로 서명 (진행 칸이 화면 아래쪽이라 안 보일 때만) */}
      {app?.status === 'approved' && unsignedHere && !ended && pendingIds[0] && (
        <StickyApply
          targetId="apply"
          title={job.title}
          note="확정됐어요 · 근무 전에 서명해 주세요"
          summary={`서류 ${pendingIds.length}건 서명이 남았어요`}
          href={`/docs/${pendingIds[0]}`}
          hrefLabel="서명하기"
          aboveTabs={!!user}
        />
      )}
      <div id="apply" className="mt-4 scroll-mt-20 space-y-3 rounded-2xl">
        {clashes.length > 0 && (
          <div className="animate-pop rounded-2xl bg-amber-50 p-4 text-sm ring-1 ring-amber-200/70">
            <p className="font-bold text-amber-900">⚠️ 같은 시간에 잡힌 근무가 있어요</p>
            <ul className="mt-1.5 space-y-1 text-amber-900">
              {clashes.map(({ m, at }) => (
                <li key={m.job!.id}>
                  <Link href={`/jobs/${m.job!.id}`} className="font-semibold underline">
                    {m.job!.title}
                  </Link>{' '}
                  · {fmtDate(kstDate(at))} {hhmm(m.job!.start_time)}~{hhmm(m.job!.end_time)} ({m.status === 'approved' ? '확정' : '지원함'})
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-amber-800">겹치는 날은 근무할 수 없어요. 여러 날 행사라면 가능한 날짜만 골라 지원해 주세요.</p>
          </div>
        )}
        {/* 오늘 끝난 근무: 지원 칸 대신 안내 + 다른 공고로 */}
        {overToday && (!app || app.status === 'cancelled') && (
          <div className="card space-y-2 text-center" data-over-today-note>
            <p className="font-bold">
              오늘 {expert ? '일정이' : '근무가'} {hhmm(job.end_time)}에 끝났어요
            </p>
            <p className="text-sm text-sub">이 공고는 더 지원할 수 없어요.</p>
            <Link href={expert ? '/pro' : '/'} className="btn-primary w-full">
              {expert ? '모집 중인 다른 의뢰 보기' : '모집 중인 다른 알바 보기'}
            </Link>
          </div>
        )}
        {!user ? (
          canApply && (
            <div className="card space-y-3 text-center">
              <p className="font-semibold">지원하려면 가입 또는 로그인이 필요해요</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/signup?type=${job.audience === 'expert' ? 'expert' : 'worker'}&next=${encodeURIComponent(path)}`} className="btn-primary">
                  1분 가입
                </Link>
                <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn-gray">
                  로그인
                </Link>
              </div>
            </div>
          )
        ) : app && app.status !== 'cancelled' ? (
          <div className="card space-y-3">
            {app.status !== 'rejected' && <ApplySteps step={app.status === 'applied' ? 2 : unsignedHere ? 3 : 4} />}
            <p className="font-semibold">
              {app.status === 'approved'
                ? '근무가 확정됐어요.'
                : app.status === 'applied'
                  ? '지원이 접수됐어요. 확정되면 알려 드릴게요.'
                  : '이번에는 함께하지 못하게 됐어요.'}
            </p>
            {replyMin != null && (
              <p className="flex items-center gap-1.5 text-sm text-sub" data-reply-time>
                <Icon name="clock" className="shrink-0 text-mute" /> 이 회사는 보통 {replySpan(replyMin)} 안에 답해요
              </p>
            )}
            {app.available_dates && <p className="text-sm text-sub">가능한 날: {app.available_dates.map(fmtDate).join(', ')}</p>}
            {app.status === 'approved' && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {app.position && <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 font-bold text-brand-700"><Icon name="pin" /> 내 배치 · {app.position}</span>}
                {!ended && (
                  <a href={`/me/calendar/${app.id}`} className="chip h-8 px-3 text-xs">
                    <Icon name="calendar" /> 달력에 넣기
                  </a>
                )}
              </div>
            )}
            {/* 지원·확정했는데 받을 계좌가 없으면: 계좌번호 칸으로 바로 (확정 뒤 급여가 늦어지지 않게) */}
            {activeApp && asWorker && !me?.bank_account_enc && (
              <Link href="/me/profile#bank_account" data-account-nudge className="card-link flex items-center gap-3 rounded-2xl p-3 ring-rose-200/70">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-lg text-rose-600">
                  <Icon name="card" />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-bold">{expert ? '대금 계좌를 등록해 주세요' : '급여 계좌를 등록해 주세요'}</span>
                  <span className="block text-sub">{app.status === 'approved' ? '없으면 지급이 늦어져요' : '확정되면 바로 필요해요'}</span>
                </span>
                <span className="shrink-0 font-semibold whitespace-nowrap text-brand-600">등록 →</span>
              </Link>
            )}
            {app.status === 'applied' && job.status === 'closed' && !ended && (
              <p className="text-sm font-semibold text-amber-700">모집 마감 · 결과는 알림으로 알려 드려요</p>
            )}
            {/* 알림을 안 켰으면 바로 여기서 켜게 (확정·전날 안내를 놓치지 않게) */}
            {activeApp && (
              <PushToggle
                publicKey={pushPublicKey()}
                variant="card"
                reason={app.status === 'approved' ? '전날 안내·시간 변경을 바로 알려 드려요' : '확정되면 바로 알려 드려요'}
              />
            )}
            {/* 확정됐는데 서명 안 한 서류가 있으면: 서명이 먼저 (서명해야 근무 시작을 누를 수 있음) */}
            {app.status === 'approved' && unsignedHere && !ended && (
              <Link href={`/docs/${pendingIds[0]}`} className="btn-primary w-full" data-sign-cta>
                <Icon name="file" /> 서류 서명하기{pendingIds.length > 1 ? ` (${pendingIds.length}건)` : ''}
              </Link>
            )}
            <div className="flex gap-2">
              {app.status === 'rejected' ? (
                // 미선발: 다음으로 할 일은 다른 공고 찾기
                <Link href={expert ? '/pro' : '/'} className="btn-primary flex-1">
                  {expert ? '모집 중인 다른 의뢰 보기 →' : '모집 중인 다른 알바 보기 →'}
                </Link>
              ) : (
                <Link href="/me" className={`${app.status === 'approved' && unsignedHere && !ended ? 'btn-gray' : 'btn-primary'} flex-1`}>
                  {app.status === 'approved' && job.start_date <= kstDate() && !ended ? '오늘 출퇴근하러 가기' : '내 근무 보기'}
                </Link>
              )}
              {/* 확정되면 같은 근무 단체방 */}
              {app.status === 'approved' && (
                <Link href={`/me/chat/room/${job.id}`} className="btn-gray shrink-0">
                  <Icon name="users" /> 단체방
                </Link>
              )}
              {app.status === 'applied' && !ended && (
                <form action={cancelApplication.bind(null, app.id)}>
                  <ConfirmSubmit className="btn-gray" confirmText="정말 취소할까요?">
                    지원 취소
                  </ConfirmSubmit>
                </form>
              )}
            </div>
            {/* 여러 날 행사: 근무 가능한 날 바꾸기 (확정 뒤에는 빼기만, 담당자에게 알림) */}
            {(app.status === 'applied' || app.status === 'approved') && dates.length > 1 && !ended && (
              <details className="text-sm">
                <summary className="cursor-pointer py-1 font-semibold text-sub">
                  📅 {app.status === 'approved' ? '이날은 못 가요 · 근무일 빼기' : '근무 가능한 날 바꾸기'}
                </summary>
                <form action={changeDates.bind(null, app.id)} className="mt-2 space-y-3 rounded-xl bg-bg p-3">
                  <p className="text-sub">
                    {app.status === 'approved'
                      ? '못 오는 날의 체크를 풀고 저장하면 담당자에게 바로 알림이 가요. 확정된 뒤에는 날을 더할 수 없어요.'
                      : '확정되기 전에는 자유롭게 바꿀 수 있어요.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dates.map((d) => {
                      const mine = (app.available_dates ?? dates).includes(d)
                      const locked = d < kstDate() || (app.status === 'approved' && !mine)
                      return (
                        <label key={d} className={locked ? 'opacity-40' : 'cursor-pointer'}>
                          <input type="checkbox" name="dates" value={d} defaultChecked={mine} disabled={locked} className="peer sr-only" />
                          <span className="inline-block rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-mute transition duration-150 select-none active:scale-95 peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700">
                            {fmtDate(d)}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  {app.status === 'approved' && <input name="reason" maxLength={100} className="input bg-white text-sm" placeholder="사유 (선택) 예: 둘째 날 학교 일정" />}
                  <SubmitButton className="btn-primary w-full" pendingText="저장 중…">
                    바꾼 날로 저장
                  </SubmitButton>
                </form>
              </details>
            )}
            {/* 확정된 근무 취소: 담당자에게 바로 알림이 가고, 사유를 고를 수 있음 */}
            {app.status === 'approved' && !ended && (
              <details className="text-sm">
                <summary className="cursor-pointer py-1 font-semibold text-sub">근무를 못 하게 됐어요</summary>
                <form action={cancelApplication.bind(null, app.id)} className="mt-2 space-y-3 rounded-xl bg-bg p-3">
                  {/* 24시간 안에 시작하는(또는 이미 시작한) 근무: 갑자기 빠지면 대신할 사람을 못 구하니 먼저 전화하게 */}
                  {soonCancel && (
                    <div className="animate-pop rounded-xl bg-amber-50 px-3 py-2.5 text-amber-900" data-cancel-soon>
                      <b className="block font-semibold">{soonCancel.left}</b>
                      <span className="block text-xs">갑자기 빠지면 대신할 사람을 구하기 어려워요</span>
                      {soonCancel.phone && (
                        <a href={`tel:${soonCancel.phone.replace(/\D/g, '')}`} className="mt-2 inline-flex items-center gap-1 font-bold text-brand-700" data-cancel-call>
                          <Icon name="phone" /> 먼저 담당자에게 전화하기
                        </a>
                      )}
                    </div>
                  )}
                  <p className="text-sub">취소하면 담당자에게 바로 알림이 가요. 사유를 고르면 담당자가 사정을 알 수 있어요.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CANCEL_REASONS.map((r) => (
                      <label key={r} className="cursor-pointer">
                        <input type="radio" name="reason" value={r} className="peer sr-only" />
                        <span className="chip h-8 px-3 text-xs peer-checked:animate-pop peer-checked:bg-brand-600 peer-checked:text-white">{r}</span>
                      </label>
                    ))}
                  </div>
                  <ConfirmSubmit className="btn-danger w-full" confirmText="한 번 더 누르면 확정 근무가 취소돼요">
                    확정 근무 취소하기
                  </ConfirmSubmit>
                </form>
              </details>
            )}
          </div>
        ) : wrongType ? (
          canApply && (
            <div className="card space-y-2 text-center">
              <p className="font-semibold">{expert ? '전문가 회원만 지원할 수 있는 의뢰예요' : '아르바이트 회원만 지원할 수 있는 공고예요'}</p>
              <p className="text-sm text-sub">
                {user.memberType === 'vendor'
                  ? '외주 업체는 담당 회사의 견적 요청으로 함께해요.'
                  : '내 정보에서 가입 유형을 바꾸면 지원할 수 있어요.'}
              </p>
              {user.memberType !== 'vendor' && (
                <Link href="/me/profile#type" className="btn-soft btn-sm">
                  가입 유형 바꾸기
                </Link>
              )}
            </div>
          )
        ) : ownJob ? (
          // 맡은 회사 공고는 근무자로 지원하지 않음 (자기 지원을 스스로 확정·기록 수정하지 않게) · 운영자는 모든 회사를 맡음
          canApply && (
            <div className="card space-y-2 text-center" data-own-job>
              <p className="font-semibold">{user?.isSuper ? '운영자 계정은 근무자로 지원하지 않아요' : '우리 회사 공고예요'}</p>
              <p className="text-sm text-sub">지원자는 관리자 화면에서 확인해 주세요</p>
              <a href="/api/view?to=admin" className="btn-soft btn-sm">
                관리자 화면으로
              </a>
            </div>
          )
        ) : needPhoto ? (
          // 얼굴 사진이 없으면 지원 칸 대신 사진 올리기 (올리면 바로 지원 칸이 나옴)
          canApply && (
            <div className="card space-y-3">
              <div>
                <p className="font-bold">📷 얼굴 사진을 먼저 올려 주세요</p>
                <p className="text-sm text-sub">올리면 바로 지원할 수 있어요</p>
              </div>
              <PhotoUpload userId={user.id} name={user.name} photoAt={null} doneKey={PHOTO_DONE_KEY} />
            </div>
          )
        ) : needIdentity ? (
          // 관리자로 가입한 계정은 근무자 정보(주민번호)가 없음 → 처음 한 번만 넣으면 바로 지원 칸
          canApply && <WorkerIdentityForm />
        ) : (
          canApply && (
            <form action={applyJob.bind(null, job.id)} className="card space-y-4">
              {/* 방금 사진을 올려 이 칸이 나타났으면 알려 줌 */}
              <PhotoDoneNote />
              {startsSoon && (
                <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900" data-soon-note>
                  <b className="block font-semibold">
                    {hhmm(job.start_time)} 시작 · {minutesText(soonMin)} 뒤예요
                  </b>
                  <span className="block">늦지 않게 갈 수 있을 때 지원해 주세요</span>
                </p>
              )}
              {startedToday && (
                <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900" data-started-note>
                  {hhmm(job.start_time)}에 이미 시작한 {expert ? '일정이에요' : '근무예요'}. 지원하면 담당자가 확인한 뒤 알려 드려요.
                </p>
              )}
              {dates.length > 1 && (
                <ApplyDays
                  days={dates.map((d) => ({ value: d, label: fmtDate(d), past: d < kstDate() }))}
                  perDay={shows(job, 'estimate') ? est.gross : null}
                />
              )}
              <div>
                <label className="label" htmlFor="message">
                  {expert ? '경력·장비 한마디 (선택)' : '한마디 (선택)'}
                </label>
                <input
                  id="message"
                  name="message"
                  className="input"
                  placeholder={expert ? '예) 공연 음향 7년, 장비 지참 가능' : '예) 행사 스태프 경험 3회, 운전 가능'}
                  maxLength={300}
                />
                {/* 전문가 의뢰는 회사가 고를 때 궁금한 말(경험·장비·포트폴리오)로 */}
                <MessageChips target="message" pro={expert} />
              </div>
              {/* 실수로 눌러 지원되지 않게: 첫 번째 누름은 확인 문구만, 한 번 더 눌러야 지원 */}
              <ConfirmSubmit className="btn-primary w-full py-3.5 text-base" track={expert ? '의뢰 지원하기' : '지원하기'} confirmText={`한 번 더 누르면 ${expert ? '의뢰에 ' : ''}지원돼요`}>
                {expert ? `${user.name}님으로 의뢰 지원하기` : `${user.name}님으로 지원하기`}
              </ConfirmSubmit>
            </form>
          )
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            href={user ? `/me/chat?job=${job.id}` : `/login?next=${encodeURIComponent(`/me/chat?job=${job.id}`)}`}
            className="btn-gray btn-sm"
          >
            <Icon name="chat" /> 이 공고 문의하기
          </Link>
          <ShareButton title={job.title} text={`${job.title} · ${scheduleSummary(job)}`} path={path} />
        </div>
      </div>
      {/* 지원·확정한 공고: 사진이 없으면 등록 창, 알림을 안 켰으면 켜기 권유 (공고마다 한 번) */}
      {activeApp && needPhoto && user && <PhotoPrompt userId={user.id} name={user.name} />}
      {activeApp && app && user && asWorker && (
        <PushNudge
          publicKey={pushPublicKey()}
          pro={expert}
          once={`job-${job.id}`}
          reason={app.status === 'approved' ? '근무 전날 안내와 시간 변경을 바로 알려 드려요' : '확정되면 바로 알려 드릴게요'}
        />
      )}
      {/* 다른 모집 중인 공고 (이 공고가 맞지 않을 때 바로 둘러보게) */}
      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="section-title">{expert ? '다른 전문가 의뢰' : '다른 모집 중인 알바'}</h2>
          <div className="space-y-3">
            {others.map((j) => (
              <JobCard key={j.id} job={j} approved={otherCounts[j.id] ?? 0} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
