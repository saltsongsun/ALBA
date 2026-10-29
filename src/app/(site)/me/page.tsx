import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import { InstallBanner } from '@/components/InstallGuide'
import { APP_STATUS } from '@/components/JobCard'
import { ClockPanel } from '@/components/worker'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { mapLinks } from '@/lib/map'
import { won } from '@/lib/format'
import { calcDay, settle } from '@/lib/pay'
import { requireUser } from '@/lib/session'
import { fmtDate, fmtDateRange, kstDate, kstTime, minutesText } from '@/lib/time'
import type { Application, Attendance, Job, SignedDoc } from '@/lib/types'

export const metadata: Metadata = { title: '내 근무' }

type AppWithJob = Application & { job: Job }

export default async function MePage(props: PageProps<'/me'>) {
  const sp = await props.searchParams
  const user = await requireUser('/me')
  const today = kstDate()

  const [apps, atts, docs] = await Promise.all([
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
  ])

  const openAtt = atts.find((a) => !a.clock_out) ?? null
  const approved = apps.filter((a) => a.status === 'approved')
  const todayApps = approved.filter(
    (a) => (a.job.start_date <= today && a.job.end_date >= today) || openAtt?.job_id === a.job_id,
  )
  const upcoming = approved.filter((a) => a.job.start_date > today)
  const waiting = apps.filter((a) => a.status === 'applied' && a.job.end_date >= today)
  const pendingDocs = docs.filter((d) => d.status === 'pending')
  const jobsById = new Map(apps.map((a) => [a.job_id, a.job]))

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
                      {scheduleText(job)} · {job.location_name}
                    </p>
                    {job.meeting_point && <p className="text-sm text-sub">집결: {job.meeting_point}</p>}
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
                      useLocation={job.lat != null}
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
                    <ClockPanel jobId={job.id} open={null} useLocation={job.lat != null} />
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
              <Link key={a.id} href={`/jobs/${a.job_id}`} className="card-link flex items-center justify-between py-4">
                <div>
                  <p className="font-bold">{a.job.title}</p>
                  <p className="text-sm text-sub">
                    {fmtDateRange(a.job.start_date, a.job.end_date)} {scheduleText(a.job)}
                  </p>
                </div>
                <span className={`badge ${APP_STATUS.approved.cls}`}>확정</span>
              </Link>
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
          <h2 className="section-title">근무 내역 · 급여</h2>
          <div className="stagger space-y-2">
            {history.map(({ job, s, paid }) => (
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
          <div className="card divide-y divide-line py-1">
            {docs
              .filter((d) => d.status === 'signed')
              .map((d) => (
                <Link key={d.id} href={`/docs/${d.id}`} className="flex items-center justify-between py-3 text-sm">
                  <span>
                    <b>{d.title}</b> <span className="text-mute">{jobsById.get(d.job_id)?.title}</span>
                  </span>
                  <span className="text-mute">보기 →</span>
                </Link>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
