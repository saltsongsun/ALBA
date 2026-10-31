import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import { ShowMore } from '@/components/Fold'
import { InstallBanner } from '@/components/InstallGuide'
import { APP_STATUS } from '@/components/JobCard'
import { SubmitButton } from '@/components/ui'
import { ClockPanel } from '@/components/worker'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { mapLinks } from '@/lib/map'
import { won } from '@/lib/format'
import { answerOvertime } from '@/app/actions/worker'
import { calcDay, OT_ASK_MIN, scheduledEnd, settle } from '@/lib/pay'
import { requireUser } from '@/lib/session'
import { fmtDate, fmtDateRange, hhmm, kstDate, kstTime, minutesText } from '@/lib/time'
import type { Application, Attendance, Job, SignedDoc } from '@/lib/types'

export const metadata: Metadata = { title: '내 근무' }

type AppWithJob = Application & { job: Job }

export default async function MePage(props: PageProps<'/me'>) {
  const sp = await props.searchParams
  const user = await requireUser('/me')
  const today = kstDate()

  const [apps, atts, docs, me] = await Promise.all([
    db()
      .from('applications')
      .select('*, job:jobs(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then((r) => (must(r) as AppWithJob[]).filter((a) => a.job)),
    db()
      .from('attendance')
      .select('*')
      .eq('user_id', user.id)
      .order('work_date', { ascending: false })
      .then((r) => must(r) as Attendance[]),
    db()
      .from('signed_docs')
      .select('id, job_id, title, status, signed_at')
      .eq('user_id', user.id)
      .neq('status', 'void')
      .then((r) => must(r) as Pick<SignedDoc, 'id' | 'job_id' | 'title' | 'status' | 'signed_at'>[]),
    db()
      .from('users')
      .select('photo_at, bank_account_enc')
      .eq('id', user.id)
      .maybeSingle()
      .then((r) => r.data as { photo_at: string | null; bank_account_enc: string | null } | null),
  ])
  const photoAt = me?.photo_at ?? null
  const hasAccount = !!me?.bank_account_enc

  const openAtt = atts.find((a) => !a.clock_out) ?? null
  const approved = apps.filter((a) => a.status === 'approved')
  const todayApps = approved.filter(
    (a) => (a.job.start_date <= today && a.job.end_date >= today) || openAtt?.job_id === a.job_id,
  )
  const upcoming = approved.filter((a) => a.job.start_date > today)
  const waiting = apps.filter((a) => a.status === 'applied' && a.job.end_date >= today)
  const pendingDocs = docs.filter((d) => d.status === 'pending')
  const jobsById = new Map(apps.map((a) => [a.job_id, a.job]))
  const weekAgo = kstDate(new Date(Date.now() - 7 * 86_400_000).toISOString())
  const otItems = atts
    .filter((a) => a.clock_out && !a.paid)
    .map((a) => {
      const job = jobsById.get(a.job_id)
      if (!job) return null
      const d = calcDay(job, a)
      const recentReject = a.ot_status === 'rejected' && a.ot_by === 'admin' && a.work_date >= weekAgo
      return d.afterMin >= OT_ASK_MIN && (d.otOpen || recentReject) ? { a, job, afterMin: d.afterMin } : null
    })
    .filter((x) => x !== null)

  // 근무 내역: 공고별 정산
  const history = [...new Set(atts.map((a) => a.job_id))]
    .map((jobId) => {
      const job = jobsById.get(jobId)
      if (!job) return null
      const rows = atts.filter((a) => a.job_id === jobId)
      const s = settle(job, rows.map((r) => calcDay(job, r)))
      return { job, rows, s, paid: rows.every((r) => r.paid) }
    })
    .filter((x) => x !== null)

  return (
    <div className="space-y-6">
      <Flash m={sp.m} />
      <InstallBanner />
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-mute">{fmtDate(today)}</p>
          <h1 className="text-2xl font-extrabold">{user.name}님, 안녕하세요</h1>
        </div>
        <Link href="/me/profile" className="btn-gray btn-sm">
          내 정보
        </Link>
      </div>

      {/* 계약 종료 시각 이후로 기록된 근무: 서로 확인해야 급여에 들어감 */}
      {otItems.length > 0 && (
        <section className="card animate-pop space-y-3 border-2 border-amber-200 bg-amber-50/50">
          <div>
            <h2 className="font-bold">⏱ 계약 시간 이후 근무 확인</h2>
            <p className="text-sm text-sub">계약 종료 시각 이후 시간은 담당자와 서로 확인한 뒤에만 급여에 들어가요.</p>
          </div>
          {otItems.map(({ a, job, afterMin }) => (
            <div key={a.id} className="space-y-2 rounded-xl bg-white p-3.5 text-sm">
              <p className="font-semibold">
                {fmtDate(a.work_date)} · {job.title}
              </p>
              <p className="text-sub">
                계약 종료 {hhmm(job.end_time)} 이후 <b className="text-ink">{minutesText(afterMin)}</b>이 더 기록됐어요. 지금은 {hhmm(job.end_time)}까지만
                계산돼 있어요.
              </p>
              {!a.ot_status ? (
                <div className="flex flex-wrap gap-2">
                  <form action={answerOvertime.bind(null, a.id, 'request')}>
                    <SubmitButton className="btn-primary btn-sm" pendingText="보내는 중…">
                      연장 근무했어요 · 확인 요청
                    </SubmitButton>
                  </form>
                  <form action={answerOvertime.bind(null, a.id, 'decline')}>
                    <SubmitButton className="btn-gray btn-sm" pendingText="처리 중…">
                      아니요, {hhmm(job.end_time)}에 끝났어요
                    </SubmitButton>
                  </form>
                </div>
              ) : a.ot_status === 'pending' && a.ot_by === 'worker' ? (
                <p className="font-semibold text-amber-700">연장 {minutesText(a.ot_minutes)} 확인 요청함 · 담당자 확인을 기다리는 중</p>
              ) : a.ot_status === 'pending' && a.ot_by === 'admin' ? (
                <div className="space-y-2">
                  <p className="font-semibold text-brand-700">담당자가 연장 {minutesText(Math.min(a.ot_minutes, afterMin))}을 인정했어요. 맞으면 확인을 눌러 주세요.</p>
                  <div className="flex flex-wrap gap-2">
                    <form action={answerOvertime.bind(null, a.id, 'accept')}>
                      <SubmitButton className="btn-primary btn-sm" pendingText="확인 중…">
                        맞아요, 확인
                      </SubmitButton>
                    </form>
                    <Link href="/me/chat" className="btn-gray btn-sm">
                      다르면 문의하기
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-rose-600">
                  담당자가 연장을 인정하지 않았어요.{' '}
                  <Link href="/me/chat" className="font-semibold underline">
                    문의하기
                  </Link>
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {pendingDocs.length > 0 && (
        <section className="card animate-pop border-2 border-amber-200 bg-amber-50/50">
          <h2 className="mb-2 font-bold">✍️ 서명할 서류가 {pendingDocs.length}건 있어요</h2>
          <p className="mb-3 text-sm text-sub">서명을 마쳐야 근무 시작 버튼을 누를 수 있어요.</p>
          <div className="space-y-2">
            {pendingDocs.map((d) => (
              <Link key={d.id} href={`/docs/${d.id}`} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 font-semibold transition active:scale-[0.98]">
                <span>
                  {d.title}
                  <span className="ml-2 text-xs font-medium text-mute">{jobsById.get(d.job_id)?.title}</span>
                </span>
                <span className="text-brand-600">서명 →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 근무가 잡혔거나 일한 적이 있는데 계좌가 없으면 (급여를 못 받음) */}
      {!hasAccount && (approved.length > 0 || atts.length > 0) && (
        <Link href="/me/profile" className="card-link flex items-center gap-3 p-4 ring-2 ring-rose-100">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-rose-50 text-xl">
            💳
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">급여 받을 계좌를 등록해 주세요</span>
            <span className="block text-sm text-sub">계좌가 있어야 근무 후 급여를 보내 드릴 수 있어요</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-brand-600">등록 →</span>
        </Link>
      )}

      {/* 지원했거나 근무가 잡혔는데 사진이 없으면 (현장에서 담당자가 알아보게) */}
      {!photoAt && (todayApps.length > 0 || upcoming.length > 0 || waiting.length > 0) && (
        <Link href="/me/profile#photo" className="card-link flex items-center gap-3 p-4">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-xl">
            📷
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">얼굴 사진을 올려 주세요</span>
            <span className="block text-sm text-sub">현장에서 담당자가 알아보기 쉬워요</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-brand-600">올리기 →</span>
        </Link>
      )}

      <section>
        <h2 className="section-title">오늘의 근무</h2>
        {todayApps.length === 0 ? (
          <Empty icon="🌤️" title="오늘 예정된 근무가 없어요">
            <Link href="/" className="font-semibold text-brand-600">
              모집 중인 알바 보기 →
            </Link>
          </Empty>
        ) : (
          <div className="stagger space-y-3">
            {todayApps.map((a) => {
              const job = a.job
              const todayAtt = atts.find((t) => t.job_id === job.id && t.work_date === today)
              const open = openAtt?.job_id === job.id ? openAtt : null
              const docsLeft = pendingDocs.filter((d) => d.job_id === job.id).length
              const notChosen = a.available_dates && !a.available_dates.includes(today)
              const map = mapLinks({ name: job.location_name, address: job.address, lat: job.lat, lng: job.lng })
              return (
                <div key={a.id} className="card space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-mute">{job.event_name}</p>
                    <h3 className="text-lg font-bold">{job.title}</h3>
                    <p className="text-sm text-sub">
                      {scheduleText(job)}
                      {job.location_name && ` · ${job.location_name}`}
                    </p>
                    {job.meeting_point && <p className="text-sm text-sub">집결: {job.meeting_point}</p>}
                    {a.position && (
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-700">
                        📍 내 배치 · {a.position}
                      </p>
                    )}
                    {(job.manager_phone || map) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        {job.manager_phone && (
                          <>
                            <span className="text-sub">현장 담당 {job.manager_name}</span>
                            <ContactButtons phone={job.manager_phone} name={`담당자 ${job.manager_name ?? ''}`.trim()} showNumber={false} />
                          </>
                        )}
                        {map && (
                          <a href={map.route ?? map.kakao} target="_blank" rel="noreferrer" className="contact-btn bg-bg text-sub hover:bg-line">
                            📍 {map.route ? '길찾기' : '지도'}
                          </a>
                        )}
                      </div>
                    )}
                    {notChosen && <p className="mt-1 text-xs text-amber-600">오늘은 근무 가능일로 고르지 않은 날이에요. 담당자 안내에 따라 주세요.</p>}
                  </div>
                  {docsLeft > 0 ? (
                    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                      위의 서류 {docsLeft}건에 서명하면 근무를 시작할 수 있어요.
                    </p>
                  ) : open ? (
                    <ClockPanel
                      jobId={job.id}
                      open={{ id: open.id, clock_in: open.clock_in, startText: kstTime(open.clock_in) }}
                      endAt={scheduledEnd(job, open.work_date).toISOString()}
                      endText={hhmm(job.end_time)}
                      useLocation={job.lat != null}
                      gpsRequired={job.gps_required}
                    />
                  ) : todayAtt?.clock_out ? (
                    <div className="rounded-xl bg-bg px-4 py-3 text-center">
                      <p className="font-bold">오늘 근무 완료 👏</p>
                      <p className="text-sm text-sub">
                        {kstTime(todayAtt.clock_in)} ~ {kstTime(todayAtt.clock_out)} (
                        {minutesText(calcDay(job, todayAtt).paidMin)} 인정)
                      </p>
                    </div>
                  ) : (
                    <ClockPanel jobId={job.id} open={null} useLocation={job.lat != null} gpsRequired={job.gps_required} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section>
          <h2 className="section-title">예정된 근무</h2>
          <div className="stagger space-y-2">
            {upcoming.map((a) => (
              <div key={a.id} className="card flex items-center gap-3 py-4">
                <Link href={`/jobs/${a.job_id}`} className="min-w-0 flex-1">
                  <p className="font-bold">{a.job.title}</p>
                  <p className="text-sm text-sub">
                    {fmtDateRange(a.job.start_date, a.job.end_date)} {scheduleText(a.job)}
                  </p>
                  {a.position && <p className="mt-0.5 text-sm font-semibold text-brand-700">📍 배치 · {a.position}</p>}
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`badge ${APP_STATUS.approved.cls}`}>확정</span>
                  {/* 휴대폰 달력에 넣기 (.ics) */}
                  <a href={`/me/calendar/${a.id}`} className="chip h-8 px-3 text-xs">
                    📅 달력에 넣기
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section>
          <h2 className="section-title">확정 대기</h2>
          <div className="stagger space-y-2">
            {waiting.map((a) => (
              <Link key={a.id} href={`/jobs/${a.job_id}`} className="card-link flex items-center justify-between py-4">
                <div>
                  <p className="font-bold">{a.job.title}</p>
                  <p className="text-sm text-sub">{fmtDateRange(a.job.start_date, a.job.end_date)}</p>
                </div>
                <span className={`badge ${APP_STATUS.applied.cls}`}>지원완료</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold">근무 내역 · 급여</h2>
            <Link href="/me/history" className="text-sm font-semibold text-brand-600">
              지난 근무 전체 →
            </Link>
          </div>
          <div className="stagger space-y-2">
            {history.slice(0, 3).map(({ job, s, paid }) => (
              <div key={job.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{job.title}</p>
                    <p className="text-sm text-sub">
                      {s.days}일 · {minutesText(s.paidMin)}
                      {s.incomplete > 0 && <span className="text-amber-600"> · 종료 기록 없음 {s.incomplete}일</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold">{won(s.net)}</p>
                    <p className="text-xs text-mute">{paid ? '지급완료' : '실수령 예상'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/print/payslip/${job.id}/${user.id}`} className="btn-soft btn-sm">
                    임금명세서
                  </Link>
                  <Link href={`/print/cert/${job.id}/${user.id}`} className="btn-gray btn-sm">
                    근무확인서
                  </Link>
                  {docs
                    .filter((d) => d.job_id === job.id && d.status === 'signed')
                    .map((d) => (
                      <Link key={d.id} href={`/docs/${d.id}`} className="btn-gray btn-sm">
                        {d.title}
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {docs.some((d) => d.status === 'signed') && (
        <section>
          <h2 className="section-title">서명한 서류</h2>
          {/* 행사마다 쌓이므로 최근 4건만 펼쳐 두고 나머지는 더 보기 */}
          <ShowMore
            limit={4}
            className="card divide-y divide-line py-1"
            restClassName="divide-y divide-line border-t border-line"
            items={docs
              .filter((d) => d.status === 'signed')
              .map((d) => (
                <Link key={d.id} href={`/docs/${d.id}`} className="flex items-center justify-between py-3 text-sm">
                  <span>
                    <b>{d.title}</b> <span className="text-mute">{jobsById.get(d.job_id)?.title}</span>
                  </span>
                  <span className="text-mute">보기 →</span>
                </Link>
              ))}
          />
        </section>
      )}
    </div>
  )
}
