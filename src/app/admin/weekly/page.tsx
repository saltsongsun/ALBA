import type { Metadata } from 'next'
import Link from 'next/link'
import LiveNumber from '@/components/LiveNumber'
import { db } from '@/lib/db'
import { won } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { dateList, fmtDate, kstDate } from '@/lib/time'
import type { Job } from '@/lib/types'
import { addDays, hoursText, plannedPay, WEEKLY_PAY_FROM, weekStart, weeklyChecks, weeklyImpact, weeklyJob, type WeekCheck, type WeekImpact } from '@/lib/weekly'

export const metadata: Metadata = { title: '주간 근무 · 주휴' }

const STATUS: Record<WeekCheck['status'], { label: string; tone: string; order: number }> = {
  eligible: { label: '주휴 대상', tone: 'bg-emerald-50 text-emerald-700', order: 0 },
  pending: { label: '개근하면 대상', tone: 'bg-brand-50 text-brand-700', order: 1 },
  absent: { label: '결근', tone: 'bg-rose-50 text-rose-700', order: 2 },
  short: { label: '15시간 미만', tone: 'bg-bg text-sub', order: 3 },
}

type WApp = { job_id: string; user_id: string; status: string; available_dates: string[] | null; held_at?: string | null }

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
  // 공고별 확정·대기 지원 (가능한 날짜까지)
  const allApps = jobs.length
    ? await db()
        .from('applications')
        .select('job_id, user_id, status, available_dates, held_at')
        .eq('company_id', admin.companyId)
        .in('status', ['approved', 'applied'])
        .in(
          'job_id',
          jobs.map((j) => j.id),
        )
        .then((r) => ((r.data ?? []) as WApp[]).filter((a) => a.status === 'approved' || a.status === 'applied'))
    : ([] as WApp[])
  const apps = allApps.filter((a) => a.status === 'approved')
  // 추가 근로 → 주휴수당 (관리자에게만): 대기 지원자를 확정하면 이 주 15시간을 넘는 사람
  const extra = (
    await Promise.all(
      jobs
        .filter((j) => weeklyJob(j) && j.status !== 'done' && j.end_date >= today)
        .map(async (j) => {
          const waiting = allApps.filter((a) => a.job_id === j.id && a.status === 'applied' && !a.held_at)
          if (!waiting.length) return []
          const m = await weeklyImpact(j, waiting).catch(() => new Map<string, WeekImpact>())
          return [...m].filter(([, w]) => w.kind === 'becomes' && w.weekStart === ws).map(([uid, w]) => ({ job: j, uid, w }))
        }),
    )
  ).flat()
  const userIds = [...new Set([...checks.map((c) => c.userId), ...extra.map((x) => x.uid)])]
  const names = userIds.length
    ? await db()
        .from('users')
        .select('id, name')
        .in('id', userIds)
        .then((r) => new Map(((r.data ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])))
    : new Map<string, string>()

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

  // 근무자 줄 둘째 줄: 대상·예정은 '시간 · 공고 수', 결근·15시간 미만은 그 이유만 (짧게)
  const sub = (c: WeekCheck) => {
    const jobsN = new Set(c.days.map((d) => d.jobId)).size
    if (c.status === 'absent') return `${hoursText(c.minutes)} · ${c.reason}`
    if (c.status === 'short') return `${hoursText(c.minutes)}`
    return `${hoursText(c.minutes)}${jobsN > 1 ? ` · 공고 ${jobsN}개` : ''}${c.status === 'pending' ? ` · 남은 ${new Set(c.days.filter((d) => !d.done).map((d) => d.date)).size}일` : ''}`
  }
  const Row = ({ href, title, sub: s2, right, data }: { href: string; title: string; sub: string; right: React.ReactNode; data: Record<string, string> }) => (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-2.5 active:bg-bg" {...data}>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">{title}</b>
          <span className="block truncate text-xs text-sub">{s2}</span>
        </span>
        {right}
      </Link>
    </li>
  )

  return (
    <div className="space-y-4" data-weekly>
      <h1 className="text-2xl font-extrabold">주간 근무 · 주휴</h1>

      {/* 주 고르기: 양쪽 화살표 칸 · 가운데 날짜 (360px에서 꺾이거나 잘리지 않게) */}
      <nav className="flex items-center gap-1.5 rounded-2xl bg-white p-1.5 ring-1 ring-line" aria-label="주 고르기" data-week-nav>
        <Link href={`/admin/weekly?w=${addDays(ws, -7)}`} className="grid size-10 shrink-0 place-items-center rounded-xl text-lg font-bold text-sub active:bg-bg" aria-label="지난 주" data-week-prev>
          ‹
        </Link>
        <Link href="/admin/weekly" className="min-w-0 flex-1 text-center text-sm leading-tight font-bold whitespace-nowrap" data-week-range>
          <span className={`block text-[11px] font-semibold ${thisWeek ? 'text-brand-600' : 'text-mute'}`}>{thisWeek ? '이번 주' : '이번 주로'}</span>
          {range}
        </Link>
        <Link href={`/admin/weekly?w=${addDays(ws, 7)}`} className="grid size-10 shrink-0 place-items-center rounded-xl text-lg font-bold text-sub active:bg-bg" aria-label="다음 주" data-week-next>
          ›
        </Link>
      </nav>

      {/* 한눈에: 숫자 둘 */}
      <div className="grid grid-cols-2 gap-3" data-weekly-tiles>
        <div className="card min-w-0 px-4 py-3">
          <p className="truncate text-xs font-semibold text-mute">예상 인건비</p>
          <p className="truncate text-[22px] leading-tight font-extrabold tabular-nums">
            <LiveNumber value={labor + holidayWon} countUp />
            <span className="text-sm font-bold">원</span>
          </p>
        </div>
        <div className="card min-w-0 px-4 py-3">
          <p className="truncate text-xs font-semibold text-mute">주휴수당 · {holiday.length}명</p>
          <p className="truncate text-[22px] leading-tight font-extrabold text-emerald-700 tabular-nums">
            <LiveNumber value={holidayWon} countUp />
            <span className="text-sm font-bold">원</span>
          </p>
        </div>
      </div>
      {before && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900" data-weekly-before>
          자동 계산 전 주 · 확인용 (정산 금액엔 없음)
        </p>
      )}

      {/* 추가 근로 → 주휴수당 (관리자에게만): 대기 지원자를 확정하면 이 주 15시간을 넘는 사람 */}
      {extra.length > 0 && (
        <section className="card p-0" data-weekly-extra>
          <h2 className="px-4 pt-3.5 pb-2 font-bold">확정하면 주휴 대상 {extra.length}명</h2>
          <ul className="divide-y divide-line border-t border-line">
            {extra.map(({ job: j, uid, w }) => (
              <Row
                key={`${j.id}|${uid}`}
                href={`/admin/jobs/${j.id}?tab=apps`}
                title={names.get(uid) ?? '지원자'}
                sub={`${j.title} · ${hoursText(w.before)}→${hoursText(w.after)}`}
                right={<b className="shrink-0 text-sm text-emerald-700 tabular-nums">{won(w.amount)}</b>}
                data={{ 'data-weekly-extra-row': '' }}
              />
            ))}
          </ul>
        </section>
      )}

      {/* 근무자별 주휴 */}
      <section className="card p-0" data-weekly-people>
        <h2 className="px-4 pt-3.5 pb-2 font-bold">근무자 {sorted.length}명</h2>
        {sorted.length === 0 ? (
          <p className="border-t border-line px-4 py-3 text-sm text-sub">이 주에 잡힌 근무가 없어요</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {sorted.map((c) => {
              const st = STATUS[c.status]
              return (
                <li key={c.userId} data-weekly-person data-status={c.status}>
                  <Link href={`/admin/workers/${c.userId}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-bg">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm">{names.get(c.userId) ?? '근무자'}</b>
                      <span className="block truncate text-xs text-sub">{sub(c)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block rounded-full px-2 py-0.5 text-[11px] font-bold ${st.tone}`}>{st.label}</span>
                      {c.amount > 0 && (
                        <b className={`mt-0.5 block text-sm tabular-nums ${c.status === 'eligible' ? 'text-emerald-700' : 'text-sub'}`} data-weekly-amount>
                          {won(c.amount)}
                        </b>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 공고별 예상 인건비 */}
      <section className="card p-0" data-weekly-jobs>
        <h2 className="px-4 pt-3.5 pb-2 font-bold">공고 {jobRows.length}개</h2>
        {jobRows.length === 0 ? (
          <p className="border-t border-line px-4 py-3 text-sm text-sub">이 주에 잡힌 공고가 없어요</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {jobRows.map(({ j, inWeek, approved, cost }) => (
              <Row
                key={j.id}
                href={`/admin/jobs/${j.id}?tab=pay`}
                title={j.title}
                sub={`${inWeek.length === 1 ? fmtDate(inWeek[0]) : `${fmtDate(inWeek[0])}~${fmtDate(inWeek[inWeek.length - 1])}`} · 확정 ${approved}명`}
                right={<span className="shrink-0 text-sm font-bold tabular-nums">{j.status === 'cancelled' ? <span className="text-xs text-mute">취소</span> : won(cost)}</span>}
                data={{ 'data-weekly-job': '' }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 계산 규칙은 접어 둠 */}
      <details className="px-1 text-xs text-sub" data-weekly-rule>
        <summary className="cursor-pointer font-semibold">주휴수당 계산 방법</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>같은 회사 공고를 합쳐 한 주(월~일) 15시간 이상 + 그 주 근무일 개근</li>
          <li>소정시간(40시간까지) ÷ 40 × 8시간 × 시급 · 근로소득 알바 공고만</li>
          <li>그 주 마지막 근무일 정산에 자동으로 들어가요 (명세서·정산표·신고자료)</li>
          <li>예상 인건비: 확정된 사람이 예정대로 일했을 때의 세전 금액</li>
        </ul>
      </details>
    </div>
  )
}
