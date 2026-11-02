import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { calcDay, settle } from '@/lib/pay'
import { requireUser } from '@/lib/session'
import { fmtDateRange, minutesText } from '@/lib/time'
import type { Attendance, Job, SignedDoc } from '@/lib/types'
import { canOpenJobDocs, docInquiryHref } from '@/lib/doc-access'

export const metadata: Metadata = { title: '지난 근무' }

/** 공고 + 낸 회사 이름 (여러 회사 일을 하면 어느 회사 급여인지 보이게) */
type JobCo = Job & { company?: { company_name: string } | null }

export default async function HistoryPage() {
  const user = await requireUser('/me/history')
  const [atts, docs, apps] = await Promise.all([
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
  ])
  // 서류는 근무가 확정된 동안만 열 수 있음 (지원 취소·확정 되돌림이면 관리자 문의)
  const appStatus = new Map(apps.map((a) => [a.job_id, a.status]))
  const docOpen = (jobId: string) => canOpenJobDocs(appStatus.get(jobId))

  // 공고별로 묶어 정산 (가장 최근에 일한 공고부터)
  const byJob = new Map<string, { job: JobCo; rows: Attendance[] }>()
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
  // 아직 입금되지 않은 급여 (지급 완료되면 알림이 감)
  const unpaid = items.filter((it) => !it.paid && it.s.net > 0)
  const unpaidNet = unpaid.reduce((n, it) => n + it.s.net, 0)

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
          <section className="grid animate-pop grid-cols-[1fr_1fr_2fr] gap-2 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg shadow-brand-600/20">
            {(
              [
                ['근무', `${total.days}일`],
                ['행사', `${items.length}곳`],
                ['실수령', won(total.net)],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <p className="text-xs font-semibold opacity-80">{k}</p>
                <p className="mt-0.5 text-lg font-extrabold tracking-tight whitespace-nowrap tabular-nums">{v}</p>
              </div>
            ))}
          </section>

          {unpaidNet > 0 && (
            <p className="-mt-3 flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span>
                ⏳ 입금 대기 <b>{unpaid.length}곳</b>
              </span>
              <b className="text-base tabular-nums">{won(unpaidNet)}</b>
            </p>
          )}
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
                        {job.company?.company_name && <p className="truncate text-xs font-semibold text-sub">🏢 {job.company.company_name}</p>}
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
                        {job.tax_type === 'business' ? '지급명세서' : '임금명세서'}
                      </Link>
                      <Link href={`/print/cert/${job.id}/${user.id}`} className="btn-gray btn-sm">
                        근무확인서
                      </Link>
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
