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
}

export default async function AdminJobs(props: PageProps<'/admin/jobs'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const tab = sp.tab === 'past' ? 'past' : sp.tab === 'draft' ? 'draft' : 'active'
  const today = kstDate()
  let q = db().from('jobs').select(JOB_WITH_APP_STATUS)
  if (tab === 'active') q = q.in('status', ['open', 'closed']).gte('end_date', today).order('start_date')
  else if (tab === 'draft') q = q.eq('status', 'draft').order('created_at', { ascending: false })
  else q = q.or(`status.eq.done,end_date.lt.${today}`).neq('status', 'draft').order('start_date', { ascending: false }).limit(100)
  const jobs = must(await q) as JobWithAppStatus[]
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
      {jobs.length === 0 ? (
        <div className="card py-12 text-center text-mute">공고가 없습니다.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
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
      )}
    </div>
  )
}
