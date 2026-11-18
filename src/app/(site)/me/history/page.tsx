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
import { paydayDate, paydayGuess, paydayLabel } from '@/lib/payday'
import { ASK_PAYLATE, FIX_DAYS, parseFix, parsePayday, pendingFix, SIGNAL } from '@/lib/signals'
import { FixRequest } from '@/components/worker'

export const metadata: Metadata = { title: '지난 근무' }

/** 공고 + 낸 회사 이름 (여러 회사 일을 하면 어느 회사 급여인지 보이게) */
type JobCo = Job & { company?: { company_name: string } | null }

/** 막대 위 짧은 금액 (123.4만) */
const short = (n: number) => (n >= 10_000 ? `${(Math.round(n / 1000) / 10).toLocaleString('ko-KR')}만` : n > 0 ? `${n.toLocaleString('ko-KR')}원` : '')

export default async function HistoryPage(props: PageProps<'/me/history'>) {
  const user = await requireUser('/me/history')
  const pro = user.memberType === 'expert' && user.role !== 'admin'
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
      .select('job_id, status, job:jobs(start_date, end_date, status)')
      .eq('user_id', user.id)
      .then((r) => must(r) as unknown as { job_id: string; status: string; job: { start_date: string; end_date: string; status: string } | null }[]),
    // 후기를 이미 쓴 공고 (못 읽어도 화면은 그대로)
    myReviewedJobs(user.id).catch(() => new Set<string>()),
  ])
  // 최근 며칠 근무의 기록 정정 요청과 그 답 (날짜별 기록에서 이미 보낸 요청은 '담당자 확인 중'으로)
  const today = kstDate()
  const fixFrom = kstDate(new Date(Date.now() - (FIX_DAYS - 1) * 86_400_000))
  const fixMsgsP = db()
    .from('messages')
    .select('job_id, body, created_at, from_admin')
    .eq('thread_user_id', user.id)
    .like('body', '%기록 정정%')
    .gte('created_at', new Date(Date.now() - FIX_DAYS * 86_400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100)
    .then(
      (r) => (r.data ?? []) as { job_id: string | null; body: string; created_at: string; from_admin: boolean }[],
      () => [],
    )
  // 정산일이 지나 이미 물어본 공고 (공고 → 마지막으로 물어본 날) — '✓ 물어봄 ›'으로 (같은 문의를 또 보내지 않게 · 답은 그 회사 문의함에서)
  const lateHead = ASK_PAYLATE.slice(0, 12)
  const payAskP = db()
    .from('messages')
    .select('job_id, body, created_at')
    .eq('thread_user_id', user.id)
    .eq('from_admin', false)
    .like('body', `${lateHead}%`)
    .order('created_at', { ascending: false })
    .limit(50)
    .then(
      (r) => {
        const last = new Map<string, string>()
        for (const m of (r.data ?? []) as { job_id: string | null; body: string; created_at: string }[]) {
          const d = kstDate(new Date(m.created_at))
          if (m.job_id && m.body.startsWith(lateHead) && d > (last.get(m.job_id) ?? '')) last.set(m.job_id, d)
        }
        return last
      },
      () => new Map<string, string>(),
    )
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
  const payAsked = await payAskP
  // 이날 보낸 정정 요청 중 담당자가 아직 답하지 않은 것 (공고 · 근무 날)
  const fixMsgs = await fixMsgsP
  const fixSentOf = (jobId: string, date: string) => {
    const req = pendingFix(
      fixMsgs.filter((m) => m.job_id === jobId),
      date,
    )
    const f = req && parseFix(req.body)
    return req && f ? { ...f, at: kstTime(req.created_at) } : null
  }
  // 알린 정산일의 날짜 (날짜 모양으로 알렸을 때 · 연도는 알린 날 기준) — 지났는데 입금 전이면 '정산일 지남 · 문의'
  const toldDate = new Map<string, string>()
  for (const m of paydayMsgs) {
    const label = parsePayday(m.body)
    if (m.job_id && label && !told.has(m.job_id)) {
      told.set(m.job_id, label)
      const d = paydayDate(label, kstDate(new Date(m.created_at)))
      if (d) toldDate.set(m.job_id, d)
    }
  }
  // 약속한 정산일(날짜): 알린 날짜가 있으면 그것, 알린 적 없으면 공고의 지급일 글자로 짐작 · 모르면 null
  const dueOf = (job: Pick<Job, 'id' | 'pay_day' | 'end_date'>) => (told.has(job.id) ? (toldDate.get(job.id) ?? null) : (paydayGuess(job.pay_day, job.end_date)?.date ?? null))
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
          // 지난 며칠 근무(오늘은 '내 근무'에서)이고 종료 기록이 있고 지급 전이면: 이 줄에서 바로 정정 요청
          fix:
            t.end && !r.paid && r.work_date >= fixFrom && r.work_date < today
              ? { inAt: t.start.toISOString(), outAt: t.end.toISOString(), sent: fixSentOf(job.id, r.work_date) }
              : null,
        }
      }),
  }))

  // 여러 회사 일을 했으면 회사별로 골라 보기 (합계·월별도 그 회사만)
  const coNames = new Map<string, string>()
  for (const it of all) if (it.job.company_id) coNames.set(it.job.company_id, it.job.company?.company_name ?? '회사')
  const companies = [...coNames.entries()].map(([id, name]) => ({ id, name, n: all.filter((it) => it.job.company_id === id).length }))
  const pick = companies.length > 1 && typeof sp.co === 'string' && coNames.has(sp.co) ? sp.co : ''
  const items = pick ? all.filter((it) => it.job.company_id === pick) : all
  // 기록이 하나도 없을 때 보여 줄 것: 곧 할 근무(확정된 것 중 가장 빠른 날) · 확정을 기다리는 지원 수
  const todayK = kstDate()
  const liveApps = apps.filter((x) => x.job && x.job.end_date >= todayK && x.job.status !== 'cancelled')
  const emptyNext =
    liveApps
      .filter((x) => x.status === 'approved')
      .map((x) => (x.job!.start_date > todayK ? x.job!.start_date : todayK))
      .sort()[0] ?? null
  const emptyWaiting = liveApps.filter((x) => x.status === 'applied').length

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
  // 그중 약속한 정산일이 지난 곳 (입금 대기 줄에 빨간 표시)
  const lateN = unpaid.filter((it) => (dueOf(it.job) ?? '9999') < today).length
  // 입금 대기를 회사별로 (회사마다 따로 입금 · 정산 예정일도 회사·공고마다 다름) — 큰 금액부터
  const unpaidBy = [
    ...unpaid
      .reduce((m, it) => {
        const id = it.job.company_id ?? ''
        const cur = m.get(id) ?? { id, name: coNames.get(id) ?? '회사', net: 0, n: 0, days: [] as string[] }
        cur.net += it.s.net
        cur.n += 1
        const day = told.get(it.job.id) ?? paydayLabel(it.job.pay_day, it.job.end_date)
        if (day && !cur.days.includes(day)) cur.days.push(day)
        m.set(id, cur)
        return m
      }, new Map<string, { id: string; name: string; net: number; n: number; days: string[] }>())
      .values(),
  ].sort((a, b) => b.net - a.net)
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
        <Link href="/me" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← {pro ? '내 일' : '내 근무'}
        </Link>
        {/* 전문가는 아래 메뉴 이름('내 일')과 같게 */}
        <h1 className="mt-2 text-2xl font-extrabold">{pro ? '지난 일' : '지난 근무'}</h1>
      </div>

      {items.length === 0 ? (
        // 기록이 없을 때: 곧 할 근무나 확정을 기다리는 지원이 있으면 그것부터 (없을 때만 '모집 중인 알바')
        <div data-history-empty={emptyNext ? 'next' : emptyWaiting ? 'waiting' : 'none'}>
          <Empty icon="🗂️" title={emptyNext ? '아직 마친 근무가 없어요' : '아직 근무 기록이 없어요'}>
            {emptyNext ? (
              <>
                <p className="text-sub">
                  다음 근무 <b className="font-semibold whitespace-nowrap text-ink">{fmtDate(emptyNext)}</b> · 마치면 여기에 쌓여요
                </p>
                <Link href="/me" className="mt-1 inline-flex min-h-10 items-center font-semibold text-brand-600">
                  내 근무 보기 →
                </Link>
              </>
            ) : emptyWaiting ? (
              <>
                <p className="text-sub">
                  지원한 공고 <b className="font-semibold text-ink">{emptyWaiting}건</b>이 확정을 기다리고 있어요
                </p>
                <Link href="/me" className="mt-1 inline-flex min-h-10 items-center font-semibold text-brand-600">
                  내 근무에서 보기 →
                </Link>
              </>
            ) : (
              <Link href="/" className="font-semibold text-brand-600">
                모집 중인 알바 보기 →
              </Link>
            )}
          </Empty>
        </div>
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

          {unpaidNet > 0 &&
            (unpaid.length < 2 ? (
              <p className="-mt-3 flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" data-unpaid>
                <span>
                  ⏳ 입금 대기 <b>{unpaid.length}곳</b>
                  {lateN > 0 && (
                    <span className="ml-1.5 inline-block animate-pop rounded-full bg-rose-100 px-2 py-0.5 align-middle text-xs font-bold text-rose-700" data-unpaid-late>
                      정산일 지남 {lateN}
                    </span>
                  )}
                </span>
                <b className="text-base tabular-nums">{won(unpaidNet)}</b>
              </p>
            ) : (
              // 두 곳 이상이면 눌러서 회사별로 (어느 회사가 언제 얼마를 주는지) — 평소엔 한 줄로 접어 둠
              <details className="group -mt-3 rounded-2xl bg-amber-50 text-sm text-amber-900" data-unpaid>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 select-none before:hidden [&::-webkit-details-marker]:hidden">
                  <span>
                    ⏳ 입금 대기 <b>{unpaid.length}곳</b>
                    {lateN > 0 && (
                      <span className="ml-1.5 inline-block animate-pop rounded-full bg-rose-100 px-2 py-0.5 align-middle text-xs font-bold text-rose-700" data-unpaid-late>
                        정산일 지남 {lateN}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <b className="text-base tabular-nums">{won(unpaidNet)}</b>
                    <span aria-hidden className="inline-block text-base leading-none text-amber-700 transition-transform duration-200 group-open:rotate-90">
                      ›
                    </span>
                  </span>
                </summary>
                <ul className="space-y-2 border-t border-amber-200/70 px-4 pt-2.5 pb-3 group-open:animate-[slide-down_0.22s_ease-out_both]" data-unpaid-rows>
                  {unpaidBy.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3" data-unpaid-co>
                      <span className="min-w-0">
                        <b className="block truncate">{u.name}</b>
                        <span className="block truncate text-xs text-amber-800/80">
                          {[u.n > 1 ? `${u.n}곳` : null, u.days.length ? `정산 예정 ${u.days.join(' · ')}` : null].filter(Boolean).join(' · ') || '정산일은 담당자에게 문의해 주세요'}
                        </span>
                      </span>
                      <b className="shrink-0 tabular-nums">{won(u.net)}</b>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
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
                      {/* 제목·회사·날짜 줄 어디를 눌러도 공고로 (이용 기록: 회사·날짜 줄을 여러 번 누름) — 제목 링크가 왼쪽 칸 전체를 덮음 */}
                      <div className="relative min-w-0" data-history-info>
                        {/* 제목을 누르면 공고 (내 근무 '오늘의 근무' 카드와 같게) */}
                        <Link href={`/jobs/${job.id}`} className="block font-bold transition-opacity after:absolute after:inset-0 after:content-[''] active:opacity-60" data-history-title>
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
                        {!paid &&
                          !(live > 0 && s.days === 0) &&
                          (told.get(job.id) ?? paydayLabel(job.pay_day, job.end_date)) &&
                          (() => {
                            const due = dueOf(job)
                            // 약속한 정산일이 지났는데 입금 전: 빨갛게 · 누르면 그 회사 담당자에게 바로 물어보기 (제목 위를 덮은 공고 링크보다 위에)
                            // 정산일 뒤에 이미 물어봤으면 '✓ 물어봄 ›' → 그 회사 문의함 (답 보러)
                            return due && due < today && (payAsked.get(job.id) ?? '') >= due ? (
                              <Link href={`/me/chat?co=${job.company_id}`} className="relative z-10 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-sub transition active:scale-95" data-payday-line="asked">
                                <span className="text-rose-600">💰 정산일 {fmtDate(due)} 지남</span> · ✓ 물어봄 ›
                              </Link>
                            ) : due && due < today ? (
                              <Link
                                href={`/me/chat?job=${job.id}&ask=paylate`}
                                className="relative z-10 inline-flex items-center gap-1 rounded-md text-xs font-bold text-rose-600 transition active:scale-95"
                                data-payday-line="over"
                              >
                                💰 정산일 {fmtDate(due)} 지남 · 문의 →
                              </Link>
                            ) : (
                              <p className="text-xs font-semibold text-amber-700" data-payday-line>
                                💰 정산 예정 {told.get(job.id) ?? paydayLabel(job.pay_day, job.end_date)}
                              </p>
                            )
                          })()}
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
                      <summary className="tap cursor-pointer text-xs font-semibold text-sub">날짜별 기록 {days.length}일</summary>
                      <ul className="mt-1.5 space-y-1 text-[13px] tabular-nums">
                        {days.map((d) => (
                          <li key={d.id} className="space-y-1" data-history-day={d.date}>
                            <div className="flex items-baseline justify-between gap-3">
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
                            </div>
                            {/* 지난 며칠 근무: 시각이 틀렸으면 여기서 바로 정정 요청 (담당자가 문의 대화에서 한 번에 고침) */}
                            {d.fix && <FixRequest attendanceId={d.id} workDate={d.date} inAt={d.fix.inAt} outAt={d.fix.outAt} inText={d.in} outText={d.out} sent={d.fix.sent} compact />}
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
