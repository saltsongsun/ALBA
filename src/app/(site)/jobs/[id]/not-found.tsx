import Link from 'next/link'
import JobCard from '@/components/JobCard'
import NotFoundCard from '@/components/NotFoundCard'
import { countApps, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { db } from '@/lib/db'
import { workOver } from '@/lib/pay'
import { getUser } from '@/lib/session'
import { kstDate } from '@/lib/time'

/** 지금 지원받는 아르바이트 공고 (가까운 날짜부터) + 내 지원 상태. 못 읽으면 빈 목록 — 안내 카드는 그대로 뜨게 */
async function openJobs(): Promise<{ jobs: JobWithAppStatus[]; mine: Record<string, string> }> {
  try {
    const today = kstDate()
    const [{ data }, user] = await Promise.all([
      db().from('jobs').select(JOB_WITH_APP_STATUS).eq('audience', 'worker').eq('status', 'open').gte('end_date', today).order('start_date').limit(30),
      getUser().catch(() => null),
    ])
    const jobs = ((data ?? []) as JobWithAppStatus[])
      .filter((j) => j.status === 'open' && j.audience !== 'expert' && j.end_date >= today && !(j.end_date === today && workOver(j, today)))
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.start_time.localeCompare(b.start_time))
    const mine: Record<string, string> = {}
    if (user && jobs.length) {
      const { data: apps } = await db().from('applications').select('job_id, status').eq('user_id', user.id)
      for (const a of (apps ?? []) as { job_id: string; status: string }[]) mine[a.job_id] = a.status
    }
    return { jobs, mine }
  } catch {
    return { jobs: [], mine: {} }
  }
}

/**
 * 지워졌거나 주소가 잘못된 공고 링크 (단톡방에 남은 예전 공고 링크를 누른 사람이 많음).
 * 안내 카드 아래에 지금 지원받는 공고를 바로 보여 줌 — 빈 화면에서 그대로 나가지 않게
 */
export default async function JobNotFound() {
  const { jobs, mine } = await openJobs()
  const counts = countApps(jobs, 'approved')
  const top = jobs.slice(0, 3)
  return (
    <div className="mx-auto max-w-md space-y-5 pt-6 text-center">
      <NotFoundCard />
      {top.length > 0 && (
        <section className="text-left" data-404-jobs>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-bold">
              지금 지원받는 공고 <span className="text-brand-600 tabular-nums">{jobs.length}</span>
            </h2>
            {jobs.length > top.length && (
              <Link href="/#jobs" className="shrink-0 text-sm font-semibold text-brand-600" data-404-jobs-all>
                전체 보기 →
              </Link>
            )}
          </div>
          <div className="stagger space-y-3">
            {top.map((j) => (
              <JobCard key={j.id} job={j} approved={counts[j.id] ?? 0} myStatus={mine[j.id]} track="없는 공고 화면 카드" />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
