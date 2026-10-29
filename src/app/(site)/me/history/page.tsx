import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { calcDay, settle } from '@/lib/pay'
import { requireUser } from '@/lib/session'
import { fmtDateRange, minutesText } from '@/lib/time'
import type { Attendance, Job, SignedDoc } from '@/lib/types'

export const metadata: Metadata = { title: '지난 근무' }

export default async function HistoryPage() {
  const user = await requireUser('/me/history')
  const [atts, docs] = await Promise.all([
    db()
      .from('attendance')
      .select('*, job:jobs(*)')
      .eq('user_id', user.id)
      .order('work_date', { ascending: false })
      .then((r) => must(r) as (Attendance & { job: Job | null })[]),
    db()
      .from('signed_docs')
      .select('id, job_id, title')
      .eq('user_id', user.id)
      .eq('status', 'signed')
      .then((r) => must(r) as Pick<SignedDoc, 'id' | 'job_id' | 'title'>[]),
  ])

  // 공고별로 묶어 정산 (가장 최근에 일한 공고부터)
  const byJob = new Map<string, { job: Job; rows: Attendance[] }>()
  for (const a of atts) {
    if (!a.job) continue
    const g = byJob.get(a.job_id) ?? { job: a.job, rows: [] }
    g.rows.push(a)
    byJob.set(a.job_id, g)
  }
  const items = [...byJob.values()].map(({ job, rows }) => ({
    job,
    rows,
    s: settle(job, rows.map((r) => calcDay(job, r))),
    paid: rows.every((r) => r.paid),
    first: rows[rows.length - 1].work_date,
    last: rows[0].work_date,
  }))

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

  return (
    <div className="space-y-6">
      <div>
        <Link href="/me" className="text-sm font-semibold text-sub">
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
          <section className="grid animate-pop grid-cols-3 gap-2 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg shadow-brand-600/20">
            {(
              [
                ['근무', `${total.days}일`],
                ['행사', `${items.length}곳`],
                ['실수령', won(total.net)],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <p className="text-xs font-semibold opacity-80">{k}</p>
                <p className="mt-0.5 text-lg font-extrabold tracking-tight tabular-nums">{v}</p>
              </div>
            ))}
          </section>

          {[...months.entries()].map(([ym, list]) => (
            <section key={ym}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[17px] font-bold">
                  {Number(ym.slice(0, 4))}년 {Number(ym.slice(5))}월
                </h2>
                <span className="text-sm text-mute tabular-nums">{won(list.reduce((n, it) => n + it.s.net, 0))}</span>
              </div>
              <div className="stagger space-y-2">
                {list.map(({ job, s, paid, first, last }) => (
                  <div key={job.id} className="card space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold">{job.title}</p>
                        <p className="text-sm text-sub">
                          {fmtDateRange(first, last)} · {s.days}일 · {minutesText(s.paidMin)}
                        </p>
                        {s.incomplete > 0 && <p className="text-xs text-amber-600">종료 기록 없음 {s.incomplete}일</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-extrabold tabular-nums">{won(s.net)}</p>
                        <span className={`badge ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{paid ? '지급완료' : '지급 예정'}</span>
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
                        .filter((d) => d.job_id === job.id)
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
          ))}
        </>
      )}
    </div>
  )
}
