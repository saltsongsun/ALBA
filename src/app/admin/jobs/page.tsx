import type { Metadata } from 'next'
import Link from 'next/link'
import Flash from '@/components/Flash'
import { countApps, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { requireAdmin } from '@/lib/session'
import { fmtDateRange, kstDate } from '@/lib/time'
import type { Job } from '@/lib/types'

export const metadata: Metadata = { title: '공고' }

const STATUS: Record<Job['status'], [string, string]> = {
  open: ['모집중', 'bg-brand-50 text-brand-700'],
  closed: ['모집마감', 'bg-amber-50 text-amber-700'],
  draft: ['임시저장', 'bg-gray-100 text-mute'],
  done: ['종료', 'bg-gray-100 text-mute'],
  cancelled: ['행사 취소', 'bg-rose-50 text-rose-600'],
}

export default async function AdminJobs(props: PageProps<'/admin/jobs'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const tab = sp.tab === 'past' ? 'past' : sp.tab === 'draft' ? 'draft' : 'active'
  const today = kstDate()
  let q = db().from('jobs').select(JOB_WITH_APP_STATUS)
  if (tab === 'active') q = q.in('status', ['open', 'closed']).gte('end_date', today).order('start_date')
  else if (tab === 'draft') q = q.eq('status', 'draft').order('created_at', { ascending: false })
  else q = q.or(`status.in.(done,cancelled),end_date.lt.${today}`).neq('status', 'draft').order('start_date', { ascending: false }).limit(100)
  // 제목·행사명·장소로 찾기
  const term = typeof sp.q === 'string' ? sp.q.trim().slice(0, 50) : ''
  const all = must(await q) as JobWithAppStatus[]
  const jobs = term
    ? all.filter((j) => [j.title, j.event_name, j.location_name].some((v) => v?.toLowerCase().includes(term.toLowerCase())))
    : all
  const counts = countApps(jobs, 'approved')
  const waitingBy = countApps(jobs, 'applied')

  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">공고 · 출퇴근</h1>
        <Link href="/admin/jobs/new" className="btn-primary">
          + 새 공고 등록
        </Link>
      </div>
      <div className="flex gap-1 text-sm font-semibold">
        {(
          [
            ['active', '진행·예정'],
            ['draft', '임시저장'],
            ['past', '지난 공고'],
          ] as const
        ).map(([k, label]) => (
          <Link key={k} href={`/admin/jobs?tab=${k}`} className={`rounded-lg px-3 py-1.5 ${tab === k ? 'bg-white shadow-sm' : 'text-mute'}`}>
            {label}
          </Link>
        ))}
      </div>
      <form className="flex gap-1.5" role="search">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={term} className="input min-w-0 flex-1 py-2 text-sm" placeholder="공고 제목·행사명·장소로 찾기" />
        <button className="btn-gray btn-sm shrink-0">찾기</button>
        {term && (
          <Link href={`/admin/jobs?tab=${tab}`} className="btn-gray btn-sm shrink-0">
            지우기
          </Link>
        )}
      </form>
      {term && (
        <p className="text-sm text-sub">
          ‘{term}’ 검색 결과 {jobs.length}건
        </p>
      )}
      {jobs.length === 0 ? (
        <div className="card py-12 text-center text-mute">공고가 없습니다.</div>
      ) : (
        <>
          {/* 휴대폰: 카드 (표는 칸이 좁아 옆으로 밀어야 해서) */}
          <div className="stagger space-y-2 sm:hidden">
            {jobs.map((j) => {
              const approved = counts[j.id] ?? 0
              return (
                <Link key={j.id} href={`/admin/jobs/${j.id}`} className="card-link block p-4">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`badge ${STATUS[j.status][1]}`}>{STATUS[j.status][0]}</span>
                    {waitingBy[j.id] > 0 && <span className="badge bg-amber-50 text-amber-700">대기 {waitingBy[j.id]}명</span>}
                    {j.event_name && <span className="text-xs font-semibold text-mute">{j.event_name}</span>}
                  </div>
                  <p className="font-bold">{j.title}</p>
                  <p className="mt-0.5 text-sm text-sub">
                    {fmtDateRange(j.start_date, j.end_date)} {scheduleText(j)}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-mute">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                      <div className="h-full origin-left animate-grow rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.round((approved / Math.max(j.headcount, 1)) * 100))}%` }} />
                    </div>
                    <span className="shrink-0 tabular-nums">
                      확정 <b className="text-ink">{approved}</b>/{j.headcount}명
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>

          <div className="card hidden overflow-x-auto p-0 sm:block">
            <table className="table">
              <thead>
                <tr>
                  <th>공고</th>
                  <th>일정</th>
                  <th>확정/모집</th>
                  <th>대기</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <Link href={`/admin/jobs/${j.id}`} className="font-semibold hover:text-brand-600">
                        {j.title}
                      </Link>
                      {j.event_name && <div className="text-xs text-mute">{j.event_name}</div>}
                    </td>
                    <td className="whitespace-nowrap">
                      {fmtDateRange(j.start_date, j.end_date)}
                      <div className="text-xs text-mute">{scheduleText(j)}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <b>{counts[j.id] ?? 0}</b>/{j.headcount}
                    </td>
                    <td>{waitingBy[j.id] ? <span className="badge bg-amber-50 text-amber-700">{waitingBy[j.id]}명</span> : '-'}</td>
                    <td>
                      <span className={`badge ${STATUS[j.status][1]}`}>{STATUS[j.status][0]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
