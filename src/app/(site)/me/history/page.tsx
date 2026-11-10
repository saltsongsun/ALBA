import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import LiveNumber from '@/components/LiveNumber'
import { db, must } from '@/lib/db'
import { withWeeklyPay } from '@/lib/weekly'
import { won } from '@/lib/format'
import { calcDay, effectiveTimes, settle, workingToday, roundCut } from '@/lib/pay'
import { requireUser } from '@/lib/session'
import { fmtDate, fmtDateRange, kstDate, kstTime, minutesText } from '@/lib/time'
import type { Attendance, Job, SignedDoc } from '@/lib/types'
import { canOpenJobDocs, docInquiryHref } from '@/lib/doc-access'
import { canWrite, myReviewedJobs } from '@/lib/community'
import { paydayLabel } from '@/lib/payday'
import { parsePayday, SIGNAL } from '@/lib/signals'

export const metadata: Metadata = { title: '지난 근무' }

/** 공고 + 낸 회사 이름 (여러 회사 일을 하면 어느 회사 급여인지 보이게) */
type JobCo = Job & { company?: { company_name: string } | null }

/** 막대 위 짧은 금액 (123.4만) */
const short = (n: number) => (n >= 10_000 ? `${(Math.round(n / 1000) / 10).toLocaleString('ko-KR')}만` : n > 0 ? `${n.toLocaleString('ko-KR')}원` : '')

export default async function HistoryPage(props: PageProps<'/me/history'>) {
  const user = await requireUser('/me/history')
  const sp = await props.searchParams
  const [atts, docs, apps, reviewed] = await Promise.all([
    db()
      .from('attendance')
      .select('*, job:jobs(*, company:companies(company_name))')
      .eq('user_id', user.id)
      .order('work_date', { ascending: false })
      .then((r) => must(r) as (Attendance & { job: JobCo | null })[]),
    db()
      .from('signed_docs')
      .select('id, job_id, title')
      .eq('user_id', user.id)
      .eq('status', 'signed')
      .then((r) => must(r) as Pick<SignedDoc, 'id' | 'job_id' | 'title'>[]),
    db()
      .from('applications')
      .select('job_id, status')
      .eq('user_id', user.id)
      .then((r) => must(r) as { job_id: string; status: string }[]),
    // 후기를 이미 쓴 공고 (못 읽어도 화면은 그대로)
    myReviewedJobs(user.id).catch(() => new Set<string>()),
  ])
  // 담당자가 알린 정산 예정일 (공고별 마지막 안내) · 못 읽으면 공고의 지급일 글자로
  const paydayMsgs = await db()
    .from('messages')
    .select('job_id, body, created_at')
    .eq('thread_user_id', user.id)
    .eq('from_admin', true)
    .like('body', `${SIGNAL.payday}%`)
    .order('created_at', { ascending: false })
    .limit(50)
    .then(
      (r) => ((r.data ?? []) as { job_id: string | null; body: string; created_at: string }[]).filter((m) => m.body.startsWith(SIGNAL.payday)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      () => [],
    )
  const told = new Map<string, string>()
  for (const m of paydayMsgs) {
    const label = parsePayday(m.body)
    if (m.job_id && label && !told.has(m.job_id)) told.set(m.job_id, label)
  }
  const reviewer = canWrite(user)
  // 서류는 근무가 확정된 동안만 열 수 있음 (지원 취소·확정 되돌림이면 관리자 문의)
  const appStatus = new Map(apps.map((a) => [a.job_id, a.status]))
  const docOpen = (jobId: string) => canOpenJobDocs(appStatus.get(jobId))

  // 공고별로 묶어 정산 (가장 최근에 일한 공고부터)
  const byJob = new Map<string, { job: JobCo; rows: Attendance[] }>()
  // 주휴수당 포함 (회사가 정산할 금액과 같게)
  for (const a of await withWeeklyPay(atts)) {
    if (!a.job) continue
    const g = byJob.get(a.job_id) ?? { job: a.job, rows: [] }
    g.rows.push(a)
    byJob.set(a.job_id, g)
  }
  const all = [...byJob.values()].map(({ job, rows }) => ({
    job,
    rows,
    s: settle(job, rows.map((r) => calcDay(job, r))),
    // 30분 단위 등으로 인정시간에서 빠진 분 (보여 주기만)
    cut: rows.reduce((t, r) => t + roundCut(calcDay(job, r)), 0),
    paid: rows.every((r) => r.paid),
    // 오늘 아직 근무 중 (퇴근 전) — '종료 기록 없음'이 아니라 '오늘 근무 중'으로
    live: workingToday(rows, kstDate()),
    worked: rows.some((r) => !!r.clock_in),
    first: rows[rows.length - 1].work_date,
    last: rows[0].work_date,
    // 날짜별 기록 (오래된 날부터): 시작~종료 시각과 그날 인정된 시간 — 금액은 위 합계·명세서에서
    days: [...rows]
      .sort((a, b) => a.work_date.localeCompare(b.work_date))
      .map((r) => {
        const t = effectiveTimes(r)
        return {
          id: r.id,
          date: r.work_date,
          in: kstTime(t.start),
          out: t.end ? kstTime(t.end) : '',
          paidMin: calcDay(job, r).paidMin,
          live: !t.end && r.work_date === kstDate(),
        }
      }),
  }))

  // 여러 회사 일을 했으면 회사별로 골라 보기 (합계·월별도 그 회사만)
  const coNames = new Map<string, string>()
  for (const it of all) if (it.job.company_id) coNames.set(it.job.company_id, it.job.company?.company_name ?? '회사')
  const companies = [...coNames.entries()].map(([id, name]) => ({ id, name, n: all.filter((it) => it.job.company_id === id).length }))
  const pick = companies.length > 1 && typeof sp.co === 'string' && coNames.has(sp.co) ? sp.co : ''
  const items = pick ? all.filter((it) => it.job.company_id === pick) : all

  // 마지막 근무일이 속한 달로 묶음
  const months = new Map<string, typeof items>()
  for (const it of items) {
    const ym = it.last.slice(0, 7)
    months.set(ym, [...(months.get(ym) ?? []), it])
  }
  const total = {
    days: items.reduce((n, it) => n + it.s.days, 0),
    net: items.reduce((n, it) => n + it.s.net, 0),
  }
  // 아직 입금되지 않은 급여 (지급 완료되면 알림이 감)
  const unpaid = items.filter((it) => !it.paid && it.s.net > 0)
  const unpaidNet = unpaid.reduce((n, it) => n + it.s.net, 0)
  // 최근 6개월 실수령 막대 (이번 달 포함)
  const nowYm = kstDate().slice(0, 7)
  const recent = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${nowYm}-15T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - (5 - i))
    const ym = d.toISOString().slice(0, 7)
    return { ym, net: (months.get(ym) ?? []).reduce((n, it) => n + it.s.net, 0) }
  })
  const top = Math.max(...recent.map((m) => m.net))

  return (
    <div className="space-y-6">
      <div>
        <Link href="/me" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 내 근무
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold">지난 근무</h1>
      </div>

      {items.length === 0 ? (
        <Empty icon="🗂️" title="아직 근무 기록이 없어요">
          <Link href="/" className="font-semibold text-brand-600">
            모집 중인 알바 보기 →
          </Link>
        </Empty>
      ) : (
        <>
          {companies.length > 1 && (
            <nav aria-label="회사별 보기" className="fade-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" data-history-companies>
              {[{ id: '', name: '전체', n: all.length }, ...companies].map((c) => {
                const on = c.id === pick
                return (
                  <Link
                    key={c.id || 'all'}
                    href={c.id ? `/me/history?co=${c.id}` : '/me/history'}
                    replace
                    scroll={false}
                    aria-current={on ? 'page' : undefined}
                    className={`flex max-w-[60vw] shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap ring-1 transition active:scale-95 ${on ? 'bg-ink text-white ring-ink' : 'bg-white text-sub ring-line'}`}
                  >
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className={`tabular-nums ${on ? 'text-white/80' : 'text-mute'}`}>{c.n}</span>
                  </Link>
                )
              })}
            </nav>
          )}
          {/* 한눈에: 실수령만 크게 · 근무일·행사 수는 오른쪽 작게 (흰 카드 하나 · 파란 큰 상자 대신) */}
          {/* 화면을 열면 0에서 그 숫자까지 올라감 ('움직임 줄이기'면 바로) */}
          <section className={`${companies.length > 1 ? '-mt-3 ' : ''}card flex animate-pop items-end justify-between gap-3 px-5 py-4`} data-history-hero>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-mute">실수령</p>
              <p className="text-2xl font-extrabold tracking-tight whitespace-nowrap tabular-nums" data-summary="실수령">
                <LiveNumber value={Math.round(total.net)} countUp />원
              </p>
              {/* 오늘 근무 중이면 '0원'이 틀린 것처럼 보이지 않게: 끝나면 더해진다고 한 줄 */}
              {items.some((it) => it.live > 0) && (
                <p className="text-xs font-semibold whitespace-nowrap text-emerald-600" data-hero-live>
                  오늘 근무는 끝나면 더해져요
                </p>
              )}
            </div>
            <p className="shrink-0 pb-0.5 text-right text-sm text-sub">
              <span className="block whitespace-nowrap" data-summary="근무">
                근무{' '}
                <b className="text-ink tabular-nums">
                  <LiveNumber value={total.days} countUp />일
                </b>
              </span>
              <span className="block whitespace-nowrap" data-summary="행사">
                행사{' '}
                <b className="text-ink tabular-nums">
                  <LiveNumber value={items.length} countUp />곳
                </b>
              </span>
            </p>
          </section>

          {unpaidNet > 0 && (
            <p className="-mt-3 flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span>
                ⏳ 입금 대기 <b>{unpaid.length}곳</b>
              </span>
              <b className="text-base tabular-nums">{won(unpaidNet)}</b>
            </p>
          )}
          {top > 0 && (
            <section className="card" data-month-bars aria-label="최근 6개월 실수령">
              <h2 className="text-sm font-bold text-sub">최근 6개월 실수령</h2>
              <div className="mt-3 grid grid-cols-6 gap-1.5">
                {recent.map(({ ym, net }) => {
                  const now = ym === nowYm
                  const label = `${Number(ym.slice(5))}월`
                  const body = (
                    <>
                      <span className={`text-[11px] font-semibold whitespace-nowrap tabular-nums ${now ? 'text-brand-700' : 'text-sub'}`}>{short(net)}</span>
                      <span
                        className={`block w-full max-w-9 origin-bottom animate-grow-up rounded-t-lg ${net > 0 ? (now ? 'bg-brand-500' : 'bg-brand-500/35') : 'bg-line'}`}
                        style={{ height: net > 0 ? `${Math.max(6, Math.round((net / top) * 84))}px` : '3px' }}
                      />
                      <span className={`text-xs ${now ? 'font-bold text-ink' : 'text-mute'}`}>{label}</span>
                    </>
                  )
                  const cls = 'flex h-28 flex-col items-center justify-end gap-1 rounded-lg'
                  return months.has(ym) ? (
                    <a key={ym} href={`#m-${ym}`} className={`${cls} transition active:scale-95`} aria-label={`${label} ${won(net)}`} data-month-bar={ym}>
                      {body}
                    </a>
                  ) : (
                    <div key={ym} className={cls} aria-label={`${label} 없음`} data-month-bar={ym}>
                      {body}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          {[...months.entries()].map(([ym, list]) => (
            <section key={ym} id={`m-${ym}`} className="scroll-mt-20">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[17px] font-bold">
                  {Number(ym.slice(0, 4))}년 {Number(ym.slice(5))}월
                </h2>
                {(() => {
                  const net = list.reduce((n, it) => n + it.s.net, 0)
                  // 이 달이 오늘 근무뿐이면 '0원' 대신 '계산 전'
                  return (
                    <span className="text-sm text-mute tabular-nums" data-month-net>
                      {net === 0 && list.some((it) => it.live > 0) ? '계산 전' : won(net)}
                    </span>
                  )
                })()}
              </div>
              <div className="stagger space-y-2">
                {list.map(({ job, s, cut, paid, live, worked, first, last, days }) => (
                  <div key={job.id} className="card space-y-3" data-history-job={job.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* 제목을 누르면 공고 (내 근무 '오늘의 근무' 카드와 같게) */}
                        <Link href={`/jobs/${job.id}`} className="block font-bold transition-opacity active:opacity-60" data-history-title>
                          {job.title}
                          <span aria-hidden className="whitespace-nowrap text-sm font-semibold text-mute">{'\u00a0'}›</span>
                        </Link>
                        {job.company?.company_name && <p className="truncate text-xs font-semibold text-sub">🏢 {job.company.company_name}</p>}
                        <p className="text-sm text-sub">
                          {fmtDateRange(first, last)}
                          {!(live > 0 && s.days === 0) && ` · ${s.days}일 · ${minutesText(s.paidMin)}`}
                        </p>
                        {cut > 0 && (
                          <p className="text-xs text-mute" data-round-cut>
                            {job.round_unit}분 단위 계산 · {minutesText(cut)} 빠짐
                          </p>
                        )}
                        {/* 여러 날 근무 중 오늘 몫 (첫날 근무 중이면 오른쪽에 한 번만) */}
                        {live > 0 && s.days > 0 && <p className="text-xs font-semibold text-emerald-600" data-live-shift>오늘 근무 중 · 끝나면 계산돼요</p>}
                        {/* 정산 예정일: 담당자가 알린 날짜, 없으면 공고의 지급일 */}
                        {!paid && !(live > 0 && s.days === 0) && (told.get(job.id) ?? paydayLabel(job.pay_day, job.end_date)) && (
                          <p className="text-xs font-semibold text-amber-700" data-payday-line>
                            💰 정산 예정 {told.get(job.id) ?? paydayLabel(job.pay_day, job.end_date)}
                          </p>
                        )}
                        {s.incomplete - live > 0 && <p className="text-xs text-amber-600">종료 기록 없음 {s.incomplete - live}일</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        {live > 0 && s.days === 0 ? (
                          <>
                            <p className="text-base font-extrabold whitespace-nowrap text-emerald-600" data-live-shift>
                              오늘 근무 중
                            </p>
                            <p className="text-xs whitespace-nowrap text-mute">끝나면 계산돼요</p>
                          </>
                        ) : (
                          <>
                            <p className="text-lg font-extrabold tabular-nums">{won(s.net)}</p>
                            <span className={`badge ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{paid ? '지급완료' : '지급 예정'}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* 날짜별 기록: 접어 둠 (며칠·몇 시간이 어떻게 나왔는지 눌러서 확인) */}
                    <details className="group border-t border-line pt-2" data-history-days>
                      <summary className="cursor-pointer text-xs font-semibold text-sub">날짜별 기록 {days.length}일</summary>
                      <ul className="mt-1.5 space-y-1 text-[13px] tabular-nums">
                        {days.map((d) => (
                          <li key={d.id} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate">
                              <b className="font-semibold">{fmtDate(d.date)}</b>
                              <span className="text-sub">
                                {' '}
                                {d.in}~{d.out}
                              </span>
                            </span>
                            <span className={`shrink-0 font-semibold ${d.live ? 'text-emerald-600' : d.out ? '' : 'text-amber-600'}`}>
                              {d.live ? '오늘 근무 중' : d.out ? minutesText(d.paidMin) : '종료 기록 없음'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                    <div className="flex flex-wrap gap-2">
                      {/* 첫 근무가 아직 진행 중이면 명세서·확인서·후기는 끝난 뒤에 (0원 명세서·일하기 전 후기 막기) */}
                      {!(live > 0 && s.days === 0) && (
                        <>
                          <Link href={`/print/payslip/${job.id}/${user.id}`} className="btn-soft btn-sm">
                            {job.tax_type === 'business' || job.tax_type === 'other' ? '지급명세서' : '임금명세서'}
                          </Link>
                          <Link href={`/print/cert/${job.id}/${user.id}`} className="btn-gray btn-sm">
                            근무확인서
                          </Link>
                        </>
                      )}
                      {docOpen(job.id)
                        ? docs
                            .filter((d) => d.job_id === job.id)
                            .map((d) => (
                              <Link key={d.id} href={`/docs/${d.id}`} className="btn-gray btn-sm">
                                {d.title}
                              </Link>
                            ))
                        : docs.some((d) => d.job_id === job.id) && (
                            <Link href={docInquiryHref(job.id)} className="btn-gray btn-sm text-mute">
                              🔒 서류는 관리자 문의
                            </Link>
                          )}
                      {/* 회사·행사 후기: 실제로 일한 공고만, 별명으로 */}
                      {reviewer && worked && !(live > 0 && s.days === 0) && (
                        <Link href={`/me/review/${job.id}`} className={`btn-sm ${reviewed.has(job.id) ? 'btn-gray' : 'btn-soft'}`} data-review-link>
                          {reviewed.has(job.id) ? '⭐ 내 후기' : '⭐ 후기 쓰기'}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
