import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import { ShowMore } from '@/components/Fold'
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

  const [apps, atts, docs, me, notices] = await Promise.all([
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
    // 담당자가 공고 확정자에게 보낸 공지 (오늘 근무 카드에 최근 것 하나)
    db()
      .from('messages')
      .select('job_id, body, created_at')
      .eq('thread_user_id', user.id)
      .eq('from_admin', true)
      .not('job_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30)
      .then((r) => (must(r) as { job_id: string; body: string; created_at: string }[]).filter((m) => m.body.startsWith('📢 공지'))),
  ])
  const latestNotice = new Map<string, { body: string; created_at: string }>()
  for (const n of notices) if (!latestNotice.has(n.job_id)) latestNotice.set(n.job_id, n)
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
                    {(() => {
                      const n = latestNotice.get(job.id)
                      if (!n) return null
                      const at = kstDate(n.created_at) === today ? kstTime(n.created_at) : fmtDate(kstDate(n.created_at))
                      return (
                        <Link href="/me/chat" className="mt-2 block rounded-xl bg-amber-50 px-3 py-2.5 text-sm ring-1 ring-amber-200 transition active:scale-[0.98]">
                          <span className="flex items-center justify-between gap-2 text-xs font-bold text-amber-800">
                            📢 담당자 공지
                            <span className="font-medium text-amber-700">{at}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap text-ink">{n.body.replace(/^📢 공지\n?/, '')}</span>
                        </Link>
                      )
                    })()}
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
