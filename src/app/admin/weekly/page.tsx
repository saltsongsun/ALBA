import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/Icon'
import LiveNumber from '@/components/LiveNumber'
import { db } from '@/lib/db'
import { won } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { dateList, fmtDate, hhmm, kstDate } from '@/lib/time'
import type { Job } from '@/lib/types'
import { addDays, hoursText, plannedPay, WEEKLY_PAY_FROM, weekStart, weeklyChecks, weeklyJob, type WeekCheck } from '@/lib/weekly'

export const metadata: Metadata = { title: '주간 근무 · 주휴' }

const STATUS: Record<WeekCheck['status'], { label: string; tone: string; order: number }> = {
  eligible: { label: '주휴 대상', tone: 'bg-emerald-50 text-emerald-700', order: 0 },
  pending: { label: '개근하면 대상', tone: 'bg-brand-50 text-brand-700', order: 1 },
  absent: { label: '결근', tone: 'bg-rose-50 text-rose-700', order: 2 },
  short: { label: '15시간 미만', tone: 'bg-bg text-sub', order: 3 },
}

type WApp = { job_id: string; user_id: string; status: string; available_dates: string[] | null }

/**
 * 주간 근무 · 주휴 (사용자 요청 2026-11-07 "여러 일을 진행할 때 예상 금액·주휴수당 요건을 자동으로 계산 + 여러 일을 관리").
 * 한 주(월~일)에 걸친 여러 공고를 한 화면에: 공고별 일정·확정 인원·예상 인건비 · 근무자별 여러 공고 합산 시간과 주휴 요건(대상·예정·결근·15시간 미만)·금액.
 * 주휴수당은 요건을 채운 주의 마지막 근무일 정산에 자동으로 들어감 (lib/weekly · 정산 탭·명세서·정산표·신고자료 같은 금액)
 */
export default async function WeeklyPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin()
  const sp = await props.searchParams
  const today = kstDate()
  const pick = typeof sp.w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? sp.w : today
  const ws = weekStart(pick)
  const we = addDays(ws, 6)
  const days = dateList(ws, we)

  const [jobs, checks] = await Promise.all([
    db()
      .from('jobs')
      .select('*')
      .eq('company_id', admin.companyId)
      .lte('start_date', we)
      .gte('end_date', ws)
      .order('start_date')
      .then((r) => ((r.data ?? []) as Job[]).filter((j) => j.start_date <= we && j.end_date >= ws && j.status !== 'draft').sort((a, b) => a.start_date.localeCompare(b.start_date))),
    weeklyChecks(admin.companyId, ws, we).catch(() => [] as WeekCheck[]),
  ])
  const userIds = [...new Set(checks.map((c) => c.userId))]
  const [names, apps] = await Promise.all([
    userIds.length
      ? db()
          .from('users')
          .select('id, name')
          .in('id', userIds)
          .then((r) => new Map(((r.data ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])))
      : new Map<string, string>(),
    // 공고별 확정 인원 (가능한 날짜까지)
    jobs.length
      ? db()
          .from('applications')
          .select('job_id, user_id, status, available_dates')
          .eq('company_id', admin.companyId)
          .eq('status', 'approved')
          .in(
            'job_id',
            jobs.map((j) => j.id),
          )
          .then((r) => ((r.data ?? []) as WApp[]).filter((a) => a.status === 'approved'))
      : ([] as WApp[]),
  ])

  // 공고별: 이 주에 잡힌 날 · 확정 인원 · 예정대로 일했을 때 예상 지급액 (세전, 연장·야간·수당 포함, 주휴는 아래 따로)
  const jobRows = jobs.map((j) => {
    const inWeek = days.filter((d) => d >= j.start_date && d <= j.end_date)
    const approved = apps.filter((a) => a.job_id === j.id)
    let cost = 0
    let workerDays = 0
    if (j.status !== 'cancelled') {
      for (const a of approved) {
        for (const d of inWeek) {
          if (a.available_dates?.length && !a.available_dates.includes(d)) continue
          cost += plannedPay(j, d).gross
          workerDays++
        }
      }
    }
    return { j, inWeek, approved: approved.length, cost, workerDays, weekly: weeklyJob(j) }
  })
  const labor = jobRows.reduce((t, r) => t + r.cost, 0)
  const holiday = checks.filter((c) => c.status === 'eligible' || c.status === 'pending')
  const holidayWon = holiday.reduce((t, c) => t + c.amount, 0)
  const sorted = [...checks].sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || b.minutes - a.minutes || (names.get(a.userId) ?? '').localeCompare(names.get(b.userId) ?? '', 'ko'))
  const before = ws < WEEKLY_PAY_FROM
  const thisWeek = weekStart(today) === ws
  const range = `${fmtDate(ws)} ~ ${fmtDate(we)}`

  return (
    <div className="space-y-4" data-weekly>
      <div>
        <h1 className="text-2xl font-extrabold">주간 근무 · 주휴</h1>
        <p className="text-sm text-sub">여러 공고를 한 주(월~일)로 모아 예상 인건비와 주휴수당을 확인해요</p>
      </div>

      {/* 주 고르기 */}
      <nav className="flex items-center justify-between gap-2 rounded-2xl bg-white p-1.5 ring-1 ring-line" aria-label="주 고르기" data-week-nav>
        <Link href={`/admin/weekly?w=${addDays(ws, -7)}`} className="rounded-xl px-3 py-2 text-sm font-semibold text-sub active:bg-bg" aria-label="지난 주">
          ‹ 지난 주
        </Link>
        <p className="min-w-0 truncate text-center text-sm font-bold" data-week-range>
          {thisWeek ? '이번 주 · ' : ''}
          {range}
        </p>
        <Link href={`/admin/weekly?w=${addDays(ws, 7)}`} className="rounded-xl px-3 py-2 text-sm font-semibold text-sub active:bg-bg" aria-label="다음 주">
          다음 주 ›
        </Link>
      </nav>
      {!thisWeek && (
        <Link href="/admin/weekly" className="-mt-2 block text-center text-xs font-semibold text-brand-600">
          이번 주로 →
        </Link>
      )}

      {/* 한눈에 */}
      <div className="grid grid-cols-2 gap-3" data-weekly-tiles>
        <div className="card min-w-0 px-4 py-3">
          <p className="truncate text-sm font-semibold text-mute">예상 인건비</p>
          <p className="mt-0.5 truncate text-[22px] leading-tight font-extrabold tabular-nums">
            <LiveNumber value={labor + holidayWon} countUp />
            <span className="text-sm font-bold">원</span>
          </p>
          <p className="truncate text-xs text-sub">세전 · 주휴 포함</p>
        </div>
        <div className="card min-w-0 px-4 py-3">
          <p className="truncate text-sm font-semibold text-mute">주휴수당</p>
          <p className="mt-0.5 truncate text-[22px] leading-tight font-extrabold text-emerald-700 tabular-nums">
            <LiveNumber value={holidayWon} countUp />
            <span className="text-sm font-bold">원</span>
          </p>
          <p className="truncate text-xs text-sub">
            대상 {checks.filter((c) => c.status === 'eligible').length}명 · 예정 {checks.filter((c) => c.status === 'pending').length}명
          </p>
        </div>
      </div>
      {before && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" data-weekly-before>
          이 주는 주휴수당 자동 계산 전이라 정산 금액에는 들어가지 않았어요 (확인용). {fmtDate(WEEKLY_PAY_FROM)} 주부터 정산에 자동으로 들어가요.
        </p>
      )}

      {/* 공고별 */}
      <section className="card p-0" data-weekly-jobs>
        <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5 pb-2">
          <h2 className="font-bold">이 주의 공고 {jobRows.length}개</h2>
          <span className="shrink-0 text-xs text-mute">근무 {jobRows.reduce((t, r) => t + r.workerDays, 0)}명·일</span>
        </div>
        {jobRows.length === 0 ? (
          <p className="px-4 pb-3.5 text-sm text-sub">이 주에 잡힌 공고가 없어요</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {jobRows.map(({ j, inWeek, approved, cost }) => (
              <li key={j.id}>
                <Link href={`/admin/jobs/${j.id}?tab=pay`} className="flex items-center gap-3 px-4 py-2.5 active:bg-bg" data-weekly-job>
                  <span className="min-w-0 flex-1">
                    <b className={`block truncate text-sm ${j.status === 'cancelled' ? 'text-mute line-through' : ''}`}>{j.title}</b>
                    <span className="block truncate text-xs text-sub">
                      {inWeek.length === 1 ? fmtDate(inWeek[0]) : `${fmtDate(inWeek[0])}~${fmtDate(inWeek[inWeek.length - 1])} ${inWeek.length}일`} · {hhmm(j.start_time)}~{hhmm(j.end_time)} · 확정 {approved}/{j.headcount}명
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm font-bold tabular-nums">
                    {j.status === 'cancelled' ? <span className="text-xs font-semibold text-mute">취소</span> : won(cost)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 근무자별 주휴 확인 */}
      <section className="card p-0" data-weekly-people>
        <div className="px-4 pt-3.5 pb-2">
          <h2 className="font-bold">근무자별 주휴 확인</h2>
          <p className="text-xs text-sub">같은 회사 여러 공고를 합쳐 한 주 15시간 이상 · 그 주 근무일을 다 나오면 대상</p>
        </div>
        {sorted.length === 0 ? (
          <p className="px-4 pb-3.5 text-sm text-sub">이 주에 근무가 잡힌 근무자가 없어요 (근로소득 알바 공고만 따져요)</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {sorted.map((c) => {
              const st = STATUS[c.status]
              const jobsN = new Set(c.days.map((d) => d.jobId)).size
              return (
                <li key={c.userId} className="px-4 py-2.5" data-weekly-person data-status={c.status}>
                  <p className="flex items-center gap-2">
                    <Link href={`/admin/workers/${c.userId}`} className="min-w-0 flex-1 truncate text-sm font-bold">
                      {names.get(c.userId) ?? '근무자'}
                    </Link>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.tone}`}>{st.label}</span>
                    {c.amount > 0 && (
                      <b className={`shrink-0 text-sm tabular-nums ${c.status === 'eligible' ? 'text-emerald-700' : 'text-sub'}`} data-weekly-amount>
                        {won(c.amount)}
                      </b>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-sub">
                    {hoursText(c.minutes)} · {new Set(c.days.map((d) => d.date)).size}일{jobsN > 1 ? ` · 공고 ${jobsN}개` : ''} · {c.reason}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <details className="card px-4 py-3 text-sm" data-weekly-rule>
        <summary className="cursor-pointer font-semibold">주휴수당은 이렇게 계산해요</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sub">
          <li>근로자로 일한 알바 공고(일용근로소득)만 따져요. 3.3% 사업소득·기타소득은 빼요.</li>
          <li>같은 회사 공고를 합쳐 한 주(월~일) 소정근로시간이 15시간 이상이고, 그 주에 잡힌 근무일을 모두 나오면 받아요.</li>
          <li>금액: 한 주 소정시간(40시간까지) ÷ 40 × 8시간 × 시급 (일급은 시급으로 바꿔서, 연장·야간·수당은 빼고).</li>
          <li>그 주 마지막 근무일 정산에 &lsquo;주휴수당&rsquo;으로 들어가 명세서·정산표·신고자료에 같이 나와요.</li>
        </ul>
      </details>
      <p className="flex items-center gap-1.5 text-xs text-mute">
        <Icon name="help" /> 예상 인건비는 확정된 사람이 예정 시간대로 일했을 때의 세전 지급총액이에요.
      </p>
    </div>
  )
}
