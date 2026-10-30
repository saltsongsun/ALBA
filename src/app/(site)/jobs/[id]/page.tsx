import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { applyJob, cancelApplication } from '@/app/actions/worker'
import { ContactButtons } from '@/components/Contact'
import Flash from '@/components/Flash'
import { APP_STATUS, wageBadge } from '@/components/JobCard'
import StickyApply from '@/components/StickyApply'
import { ConfirmSubmit, ShareButton, SubmitButton } from '@/components/ui'
import VenueMap from '@/components/VenueMap'
import { approvedCounts, getJob } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleSummary, scheduleText } from '@/lib/docs'
import { won } from '@/lib/format'
import { shows } from '@/lib/jobFields'
import { breakDescription, estimateDay, TAX_LABEL } from '@/lib/pay'
import { getUser } from '@/lib/session'
import { dateList, fmtDate, fmtDateRange, kstDate, minutesText } from '@/lib/time'
import type { Application } from '@/lib/types'
import { isUuid } from '@/lib/validate'

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

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <dt className="w-16 shrink-0 text-sm font-semibold text-mute">{k}</dt>
      <dd className="min-w-0 flex-1 text-[15px] whitespace-pre-wrap">{children}</dd>
    </div>
  )
}

export default async function JobPage(props: PageProps<'/jobs/[id]'>) {
  const { id } = await props.params
  const sp = await props.searchParams
  const [job, user] = await Promise.all([load(id), getUser()])
  if (!job || job.status === 'draft') notFound()

  const [counts, app, docs] = await Promise.all([
    approvedCounts([job.id]),
    user
      ? db().from('applications').select('*').eq('job_id', job.id).eq('user_id', user.id).maybeSingle().then((r) => r.data as Application | null)
      : null,
    job.required_docs.length
      ? db().from('doc_templates').select('id, title').in('id', job.required_docs).then((r) => must(r) as { id: string; title: string }[])
      : [],
  ])
  const approved = counts[job.id] ?? 0
  const est = estimateDay(job)
  const dates = dateList(job.start_date, job.end_date)
  const ended = job.end_date < kstDate()
  const canApply = job.status === 'open' && !ended
  const path = `/jobs/${job.id}`

  return (
    <>
      <Flash m={sp.m} />
      <div className="card">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {canApply ? (
            <span className="badge bg-brand-50 text-brand-700">모집중</span>
          ) : (
            <span className="badge bg-gray-100 text-mute">마감</span>
          )}
          {app && APP_STATUS[app.status] && <span className={`badge ${APP_STATUS[app.status].cls}`}>{APP_STATUS[app.status].label}</span>}
          {job.event_name && <span className="text-xs font-semibold text-mute">{job.event_name}</span>}
        </div>
        <h1 className="text-[22px] leading-snug font-extrabold">{job.title}</h1>
        <div className="mt-4 animate-pop rounded-2xl bg-bg p-4 [animation-delay:120ms]">
          {shows(job, 'estimate') ? (
            <>
              <p className="text-sm text-sub">{wageBadge(job)}</p>
              <p className="mt-0.5 text-2xl font-extrabold">하루 약 {won(est.gross)}</p>
              <p className="mt-1 text-xs text-mute">
                {scheduleText(job)} 기준 · 휴게 {est.breakMin}분 제외 {minutesText(est.paidMin)} · 세전
              </p>
            </>
          ) : (
            <p className="text-2xl font-extrabold">{wageBadge(job)}</p>
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
            </Row>
          )}
          {job.meeting_point && <Row k="집결">{job.meeting_point}</Row>}
          {shows(job, 'headcount') && (
            <Row k="인원">
              {job.headcount}명 모집 · {approved}명 확정
            </Row>
          )}
          {job.task && <Row k="업무">{job.task}</Row>}
          {shows(job, 'break') && <Row k="휴게">{breakDescription(job)}</Row>}
          {job.allowance > 0 && (
            <Row k="수당">
              {job.allowance_label || '수당'} 1일 {won(job.allowance)}
            </Row>
          )}
          {job.premium_enabled && shows(job, 'premium') && <Row k="가산">8시간 초과·야간(22~06시) 근무 50% 가산</Row>}
          {shows(job, 'tax') && (
            <Row k="공제">
              {TAX_LABEL[job.tax_type]}
              {job.tax_type === 'daily' && job.employment_insurance ? ' · 고용보험 0.9%' : ''}
            </Row>
          )}
          {job.pay_day && shows(job, 'pay_day') && <Row k="지급일">{job.pay_day}</Row>}
          {job.dress_code && <Row k="복장">{job.dress_code}</Row>}
          {job.supplies && <Row k="준비물">{job.supplies}</Row>}
          {job.conditions.map((c, i) => (
            <Row key={i} k={c.label}>
              {c.value}
            </Row>
          ))}
          {job.manager_name && (
            <Row k="담당자">
              {job.manager_name}
              {job.manager_phone && (
                <div className="mt-1">
                  <ContactButtons phone={job.manager_phone} name={`담당자 ${job.manager_name ?? ''}`.trim()} />
                </div>
              )}
            </Row>
          )}
          {docs.length > 0 && shows(job, 'docs') && <Row k="서류">{docs.map((d) => d.title).join(', ')} (확정 후 앱에서 전자서명)</Row>}
        </dl>
        {job.description && <p className="mt-3 rounded-xl bg-bg p-4 text-[15px] whitespace-pre-wrap text-sub">{job.description}</p>}
        {(job.location_name || job.address || job.lat != null) && (
          <div className="mt-4">
            <h2 className="mb-2 text-sm font-bold text-sub">찾아오는 길</h2>
            <VenueMap name={job.location_name} address={job.address} lat={job.lat} lng={job.lng} />
          </div>
        )}
      </div>

      {/* 아직 지원 전이면 휴대폰 아래에 지원 버튼을 띄움 (지원 칸이 화면 아래쪽이라) */}
      {canApply && (!app || app.status === 'cancelled') && (
        <StickyApply
          targetId="apply"
          title={job.title}
          summary={shows(job, 'estimate') ? `하루 약 ${won(est.gross)}` : wageBadge(job)}
          href={user ? undefined : `/signup?next=${encodeURIComponent(path)}`}
          aboveTabs={!!user}
        />
      )}
      <div id="apply" className="mt-4 scroll-mt-20 space-y-3 rounded-2xl">
        {!user ? (
          canApply && (
            <div className="card space-y-3 text-center">
              <p className="font-semibold">지원하려면 가입 또는 로그인이 필요해요</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/signup?next=${encodeURIComponent(path)}`} className="btn-primary">
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
            <p className="font-semibold">
              {app.status === 'approved'
                ? '근무가 확정됐어요.'
                : app.status === 'applied'
                  ? '지원이 접수됐어요. 확정되면 알려 드릴게요.'
                  : '이번에는 함께하지 못하게 됐어요.'}
            </p>
            {app.available_dates && <p className="text-sm text-sub">가능한 날: {app.available_dates.map(fmtDate).join(', ')}</p>}
            <div className="flex gap-2">
              <Link href="/me" className="btn-primary flex-1">
                {app.status === 'approved' && job.start_date <= kstDate() && !ended ? '오늘 출퇴근하러 가기' : '내 근무 보기'}
              </Link>
              {(app.status === 'applied' || app.status === 'approved') && !ended && (
                <form action={cancelApplication.bind(null, app.id)}>
                  <ConfirmSubmit className="btn-gray" confirmText="정말 취소할까요?">
                    지원 취소
                  </ConfirmSubmit>
                </form>
              )}
            </div>
          </div>
        ) : (
          canApply && (
            <form action={applyJob.bind(null, job.id)} className="card space-y-4">
              {dates.length > 1 && (
                <div>
                  <input type="hidden" name="date_choice" value="1" />
                  <p className="label">근무 가능한 날짜</p>
                  <div className="flex flex-wrap gap-2">
                    {dates.map((d) => (
                      <label key={d} className="cursor-pointer">
                        <input type="checkbox" name="dates" value={d} defaultChecked className="peer sr-only" />
                        <span className="inline-block rounded-xl border border-line px-3 py-2 text-sm font-semibold text-mute transition duration-150 select-none active:scale-95 peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700">
                          {fmtDate(d)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="label" htmlFor="message">
                  한마디 (선택)
                </label>
                <input id="message" name="message" className="input" placeholder="예) 행사 스태프 경험 3회, 운전 가능" maxLength={300} />
              </div>
              <SubmitButton className="btn-primary w-full py-3.5 text-base" pendingText="지원 중…">
                {user.name}님으로 지원하기
              </SubmitButton>
            </form>
          )
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            href={user ? `/me/chat?job=${job.id}` : `/login?next=${encodeURIComponent(`/me/chat?job=${job.id}`)}`}
            className="btn-gray btn-sm"
          >
            💬 이 공고 문의하기
          </Link>
          <ShareButton title={job.title} text={`${job.title} · ${scheduleSummary(job)}`} path={path} />
        </div>
      </div>
    </>
  )
}
