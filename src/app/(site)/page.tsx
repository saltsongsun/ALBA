import Link from 'next/link'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import JobCard from '@/components/JobCard'
import { countApps, getSettings, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { getUser } from '@/lib/session'
import { kstDate } from '@/lib/time'

export default async function HomePage(props: PageProps<'/'>) {
  const sp = await props.searchParams
  const today = kstDate()
  const [user, settings, jobs, myApps] = await Promise.all([
    getUser(),
    getSettings(),
    db()
      .from('jobs')
      .select(JOB_WITH_APP_STATUS)
      .in('status', ['open', 'closed'])
      .gte('end_date', today)
      .order('start_date')
      .limit(50)
      .then((r) => must(r) as JobWithAppStatus[]),
    // 내 지원 상태도 공고 목록과 함께 읽음
    getUser().then((u) =>
      u
        ? db()
            .from('applications')
            .select('job_id, status')
            .eq('user_id', u.id)
            .then((r) => must(r) as { job_id: string; status: string }[])
        : [],
    ),
  ])
  const counts = countApps(jobs, 'approved')
  const mine: Record<string, string> = {}
  for (const r of myApps) mine[r.job_id] = r.status
  // 오늘 확정된 근무가 있으면 맨 위에서 바로 출퇴근 화면으로 (카톡 링크로 들어와도 한 번에)
  const todayJob = jobs.find((j) => mine[j.id] === 'approved' && j.start_date <= today && j.end_date >= today)

  return (
    <>
      <Flash m={sp.m} />
      {todayJob && (
        <Link href="/me" className="card-link mb-4 flex animate-pop items-center gap-3 p-4 ring-2 ring-emerald-200">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2.5M9.5 2.5h5" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-emerald-700">오늘 근무가 있어요</span>
            <span className="block truncate font-bold">{todayJob.title}</span>
            <span className="block truncate text-sm text-sub">
              {scheduleText(todayJob)}
              {todayJob.location_name && ` · ${todayJob.location_name}`}
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold text-emerald-700">출퇴근 →</span>
        </Link>
      )}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white shadow-lg shadow-brand-600/20">
        {/* 배경에 천천히 떠다니는 동그라미 */}
        <span aria-hidden className="pointer-events-none absolute -top-12 -right-10 size-44 animate-float rounded-full bg-white/10" />
        <span aria-hidden className="pointer-events-none absolute right-14 -bottom-14 size-28 animate-float rounded-full bg-white/10 [animation-delay:1.4s]" />
        <div className="relative">
          <p className="text-sm font-semibold opacity-80">{settings.company_name}</p>
          <h1 className="mt-1 text-2xl leading-tight font-extrabold">
            행사 단기 알바,
            <br />
            지원부터 정산까지 한&nbsp;번에
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
        </div>
      </section>

      <h2 className="section-title">모집 중인 알바 {jobs.length > 0 && <span className="text-brand-600">{jobs.length}</span>}</h2>
      {jobs.length === 0 ? (
        <Empty icon="🔍" title="지금은 모집 중인 공고가 없어요">
          새 공고가 올라오면 단톡방으로 알려 드릴게요.
        </Empty>
      ) : (
        <div className="stagger space-y-3">
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} approved={counts[j.id] ?? 0} myStatus={mine[j.id]} />
          ))}
        </div>
      )}
    </>
  )
}
