import Link from 'next/link'
import Flash from '@/components/Flash'
import JobCard from '@/components/JobCard'
import { approvedCounts, getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { getUser } from '@/lib/session'
import { kstDate } from '@/lib/time'
import type { Job } from '@/lib/types'

export default async function HomePage(props: PageProps<'/'>) {
  const sp = await props.searchParams
  const today = kstDate()
  const [user, settings, jobs] = await Promise.all([
    getUser(),
    getSettings(),
    db()
      .from('jobs')
      .select('*')
      .in('status', ['open', 'closed'])
      .gte('end_date', today)
      .order('start_date')
      .limit(50)
      .then((r) => must(r) as Job[]),
  ])
  const counts = await approvedCounts(jobs.map((j) => j.id))
  const mine: Record<string, string> = {}
  if (user && jobs.length) {
    const rows = must(
      await db().from('applications').select('job_id, status').eq('user_id', user.id).in('job_id', jobs.map((j) => j.id)),
    ) as { job_id: string; status: string }[]
    for (const r of rows) mine[r.job_id] = r.status
  }

  return (
    <>
      <Flash m={sp.m} />
      <section className="mb-6 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white">
        <p className="text-sm font-semibold opacity-80">{settings.company_name}</p>
        <h1 className="mt-1 text-2xl leading-tight font-extrabold">
          행사 단기 알바,
          <br />
          지원부터 정산까지 한 번에
        </h1>
        <p className="mt-2 text-sm opacity-90">한 번 가입하면 출퇴근 버튼만 누르면 됩니다. 근로계약서와 급여명세서도 여기서 받아요.</p>
        {!user && (
          <div className="mt-4 flex gap-2">
            <Link href="/signup" className="btn bg-white text-brand-700">
              간편 가입
            </Link>
            <Link href="/login" className="btn bg-white/15 text-white">
              로그인
            </Link>
          </div>
        )}
        {user && (
          <Link href="/me" className="btn mt-4 bg-white text-brand-700">
            {user.name}님 근무 보기 →
          </Link>
        )}
      </section>

      <h2 className="section-title">모집 중인 알바 {jobs.length > 0 && <span className="text-brand-600">{jobs.length}</span>}</h2>
      {jobs.length === 0 ? (
        <div className="card py-12 text-center text-mute">지금은 모집 중인 공고가 없어요.</div>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} approved={counts[j.id] ?? 0} myStatus={mine[j.id]} />
          ))}
        </div>
      )}
    </>
  )
}
