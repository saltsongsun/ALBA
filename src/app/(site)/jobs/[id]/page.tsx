import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { applyJob, cancelApplication } from '@/app/actions/worker'
import { ContactButtons } from '@/components/Contact'
import Flash from '@/components/Flash'
import MessageChips from '@/components/MessageChips'
import JobCard, { APP_STATUS, wageBadge } from '@/components/JobCard'
import StickyApply from '@/components/StickyApply'
import { ConfirmSubmit, ShareButton, SubmitButton } from '@/components/ui'
import VenueMap from '@/components/VenueMap'
import { approvedCounts, countApps, getJob, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { overlapDay } from '@/lib/overlap'
import { scheduleSummary, scheduleText } from '@/lib/docs'
import { won } from '@/lib/format'
import { shows } from '@/lib/jobFields'
import { breakDescription, estimateDay, TAX_LABEL } from '@/lib/pay'
import { getUser } from '@/lib/session'
import { dateList, fmtDate, fmtDateRange, hhmm, kstDate, minutesText } from '@/lib/time'
import type { Application, Job } from '@/lib/types'
import { isUuid } from '@/lib/validate'
import JobViewBeacon from '@/components/JobViewBeacon'
import ApplySteps from '@/components/ApplySteps'

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

  const [counts, app, docs, mine, myPending] = await Promise.all([
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
    // 이 공고에서 아직 서명 안 한 내 서류 수 (진행 단계 표시용)
    user
      ? db()
          .from('signed_docs')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', job.id)
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .then((r) => r.count ?? 0)
      : 0,
  ])
  // 날짜가 가까운 다른 모집 공고 3개
  const others = (
    must(
      await db().from('jobs').select(JOB_WITH_APP_STATUS).eq('status', 'open').gte('end_date', kstDate()).neq('id', job.id).order('start_date').limit(3),
    ) as JobWithAppStatus[]
  ).filter((j) => j.id !== job.id && j.status === 'open' && j.end_date >= kstDate())
  const otherCounts = countApps(others, 'approved')
  const approved = counts[job.id] ?? 0
  const unsignedHere = myPending > 0
  const est = estimateDay(job)
  const dates = dateList(job.start_date, job.end_date)
  const ended = job.end_date < kstDate()
  const canApply = job.status === 'open' && !ended
  const path = `/jobs/${job.id}`
  // 아직 지원 전이면 겹치는 근무를 미리 알려 줌 (지원은 막지 않음: 여러 날 행사는 날짜를 골라 지원할 수 있어서)
  const clashes =
    canApply && (!app || app.status === 'cancelled')
      ? mine
          .filter((m) => m.job && m.job.end_date >= kstDate() && m.job.status !== 'cancelled')
          .map((m) => ({ m, at: overlapDay(job, { ...m.job!, dates: m.available_dates }) }))
          .filter((x): x is { m: (typeof mine)[number]; at: string } => !!x.at)
      : []

  return (
    <>
      <Flash m={sp.m} />
      {job.status === 'cancelled' && (
        <div className="mb-3 animate-pop rounded-2xl border-2 border-rose-200 bg-rose-50 p-4">
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
          {canApply ? (
            <span className="badge bg-brand-50 text-brand-700">모집중</span>
          ) : job.status === 'cancelled' ? (
            <span className="badge bg-rose-50 text-rose-600">행사 취소</span>
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
          {(docs.length > 0 || job.contract_method !== 'app') && shows(job, 'docs') && (
            <Row k="서류">
              {[
                job.contract_method === 'paper' && '근로계약서 (현장에서 종이로 작성)',
                job.contract_method === 'external' && '근로계약서 (모두싸인 등 전자계약)',
                docs.length > 0 && `${docs.map((d) => d.title).join(', ')} (확정 후 앱에서 전자서명)`,
              ]
                .filter(Boolean)
                .join('\n')}
            </Row>
          )}
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
      {/* 관리자 조회 현황용 신호 (관리자 본인은 세지 않음) */}
      <JobViewBeacon jobId={job.id} />
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
        {clashes.length > 0 && (
          <div className="animate-pop rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm">
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
            {app.status !== 'rejected' && <ApplySteps step={app.status === 'applied' ? 2 : unsignedHere ? 3 : 4} />}
            <p className="font-semibold">
              {app.status === 'approved'
                ? '근무가 확정됐어요.'
                : app.status === 'applied'
                  ? '지원이 접수됐어요. 확정되면 알려 드릴게요.'
                  : '이번에는 함께하지 못하게 됐어요.'}
            </p>
            {app.available_dates && <p className="text-sm text-sub">가능한 날: {app.available_dates.map(fmtDate).join(', ')}</p>}
            {app.status === 'approved' && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {app.position && <span className="rounded-lg bg-brand-50 px-2.5 py-1 font-bold text-brand-700">📍 내 배치 · {app.position}</span>}
                {!ended && (
                  <a href={`/me/calendar/${app.id}`} className="chip h-8 px-3 text-xs">
                    📅 달력에 넣기
                  </a>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Link href="/me" className="btn-primary flex-1">
                {app.status === 'approved' && job.start_date <= kstDate() && !ended ? '오늘 출퇴근하러 가기' : '내 근무 보기'}
              </Link>
              {app.status === 'applied' && !ended && (
                <form action={cancelApplication.bind(null, app.id)}>
                  <ConfirmSubmit className="btn-gray" confirmText="정말 취소할까요?">
                    지원 취소
                  </ConfirmSubmit>
                </form>
              )}
            </div>
            {/* 확정된 근무 취소: 담당자에게 바로 알림이 가고, 사유를 고를 수 있음 */}
            {app.status === 'approved' && !ended && (
              <details className="text-sm">
                <summary className="cursor-pointer py-1 font-semibold text-sub">근무를 못 하게 됐어요</summary>
                <form action={cancelApplication.bind(null, app.id)} className="mt-2 space-y-3 rounded-xl bg-bg p-3">
                  <p className="text-sub">취소하면 담당자에게 바로 알림이 가요. 사유를 고르면 담당자가 사정을 알 수 있어요.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CANCEL_REASONS.map((r) => (
                      <label key={r} className="cursor-pointer">
                        <input type="radio" name="reason" value={r} className="peer sr-only" />
                        <span className="chip h-8 px-3 text-xs peer-checked:bg-brand-600 peer-checked:text-white">{r}</span>
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
                <MessageChips target="message" />
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
      {/* 다른 모집 중인 알바 (이 공고가 맞지 않을 때 바로 둘러보게) */}
      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="section-title">다른 모집 중인 알바</h2>
          <div className="space-y-3">
            {others.map((j) => (
              <JobCard key={j.id} job={j} approved={otherCounts[j.id] ?? 0} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
