import Link from 'next/link'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import JobCard from '@/components/JobCard'
import { countApps, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { APP_NAME } from '@/lib/brand'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { getUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { isPro } from '@/lib/members'
import { kstDate } from '@/lib/time'
import { isUuid } from '@/lib/validate'
import { overlapDay } from '@/lib/overlap'
import { NewJobsChip } from '@/components/NewJobs'
import { companyRating, companyRatings } from '@/lib/community'

export default async function HomePage(props: PageProps<'/'>) {
  const sp = await props.searchParams
  const today = kstDate()
  // 전문가·외주 업체는 전문가 화면으로 (아르바이트 공고와 섞이지 않게)
  const me = await getUser()
  if (me && me.role !== 'admin' && isPro(me.memberType)) redirect('/pro')
  // 회사가 단톡방에 올린 '우리 회사 공고 모음' 링크(/?co=회사id)면 그 회사 공고만
  const coId = typeof sp.co === 'string' && isUuid(sp.co) ? sp.co : null
  const company = coId
    ? ((await db().from('companies').select('id, company_name, verified').eq('id', coId).eq('active', true).maybeSingle()).data as {
        id: string
        company_name: string
        verified: boolean | null
      } | null)
    : null
  // 회사 공고 모음: 근무자 후기 평균 별점 (가입한 회원에게만)
  const rating = company && me ? await companyRating(company.id).catch(() => null) : null
  const jobsQuery = db().from('jobs').select(JOB_WITH_APP_STATUS).eq('audience', 'worker').in('status', ['open', 'closed']).gte('end_date', today)
  const [user, jobs, myApps] = await Promise.all([
    getUser(),
    (company ? jobsQuery.eq('company_id', company.id) : jobsQuery)
      .order('start_date')
      .limit(50)
      .then((r) => must(r) as JobWithAppStatus[]),
    // 내 지원 상태도 공고 목록과 함께 읽음
    getUser().then((u) =>
      u
        ? db()
            .from('applications')
            .select('job_id, status, available_dates, job:jobs(start_date, end_date, start_time, end_time, status)')
            .eq('user_id', u.id)
            .then(
              (r) =>
                must(r) as unknown as {
                  job_id: string
                  status: string
                  available_dates: string[] | null
                  job: Pick<JobWithAppStatus, 'start_date' | 'end_date' | 'start_time' | 'end_time' | 'status'> | null
                }[],
            )
        : [],
    ),
  ])
  const counts = countApps(jobs, 'approved')
  // 회사별 근무자 후기 별점 (가입한 회원에게만, 카드에 ★4.5)
  const ratings = user ? await companyRatings(jobs.map((j) => j.company_id)) : {}
  // 회사 공고 모음: 지금 지원받는 공고 수 (모집 마감은 빼고)
  const openCount = jobs.filter((j) => j.status === 'open').length
  const mine: Record<string, string> = {}
  for (const r of myApps) mine[r.job_id] = r.status
  // 확정·지원한 내 일정과 같은 날 같은 시간대인 공고 (지원 버튼을 누르기 전에 목록에서 미리 알게: 두 군데 겹치기 지원 실수 막기)
  const myShifts = myApps.filter((r) => (r.status === 'approved' || r.status === 'applied') && r.job && r.job.status !== 'cancelled' && r.job.end_date >= today)
  const clashes = (j: JobWithAppStatus) =>
    (!mine[j.id] || mine[j.id] === 'cancelled') && j.status === 'open' && myShifts.some((r) => r.job_id !== j.id && overlapDay(j, { ...r.job!, dates: r.available_dates }))

  // 날짜로 거르기: 오늘·내일 / 이번 주말 / 7일 안 (그리고 지원 가능한 것만)
  const when = (['soon', 'weekend', 'week'] as const).find((w) => w === sp.when) ?? null
  const avail = sp.avail === '1'
  // 근무자 후기 별점 4점 이상인 회사 공고만 (회원)
  const good = sp.good === '1' && !!user
  const plus = (n: number) => kstDate(new Date(Date.parse(`${today}T12:00:00+09:00`) + n * 86_400_000))
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 일요일
  const sat = dow === 0 ? today : plus(6 - dow)
  const sun = dow === 0 ? today : plus(7 - dow)
  const overlaps = (j: JobWithAppStatus, from: string, to: string) => j.start_date <= to && j.end_date >= from
  const listed = jobs.filter((j) => {
    if (when === 'soon' && !overlaps(j, today, plus(1))) return false
    if (when === 'weekend' && !overlaps(j, dow === 0 ? today : sat, sun)) return false
    if (when === 'week' && !overlaps(j, today, plus(7))) return false
    if (avail && (j.status !== 'open' || (counts[j.id] ?? 0) >= j.headcount || (mine[j.id] && mine[j.id] !== 'cancelled'))) return false
    if (good && !((ratings[j.company_id]?.avg ?? 0) >= 4)) return false
    return true
  })
  const filterHref = (w: string | null, a: boolean, g: boolean = good) => {
    const q = new URLSearchParams()
    if (company) q.set('co', company.id)
    if (w) q.set('when', w)
    if (a) q.set('avail', '1')
    if (g) q.set('good', '1')
    const s = q.toString()
    return s ? `/?${s}#jobs` : '/#jobs'
  }
  // 오늘 확정된 근무가 있으면 맨 위에서 바로 출퇴근 화면으로 (카톡 링크로 들어와도 한 번에)
  const todayJob = jobs.find((j) => mine[j.id] === 'approved' && j.start_date <= today && j.end_date >= today)
  // 로그인한 근무자: 소개 배너 대신 한 줄 인사 + 내 근무 현황 (공고 목록이 첫 화면에 보이게)
  const upcomingCount = jobs.filter((j) => mine[j.id] === 'approved' && j.id !== todayJob?.id).length
  const waitingCount = jobs.filter((j) => mine[j.id] === 'applied').length

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
      {company ? (
        // 회사 공고 모음: 어느 회사 공고인지 + 가입·로그인 뒤 이 화면으로 돌아오게
        <section className="card mb-5 space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-xl">
              🏢
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{company.company_name}</span>
              {/* 링크로 처음 온 근무자가 믿을 만한 회사인지 · 지금 지원할 수 있는 공고가 몇 개인지 */}
              <span className="block truncate text-sm text-sub" data-company-sub>
                {company.verified === true && <b className="font-semibold text-emerald-600">✓ 확인된 회사 · </b>}
                {openCount > 0 ? `모집 중 ${openCount}개` : '지금은 모집 중인 공고가 없어요'}
              </span>
              {rating && (
                <Link href={`/community/company/${company.id}`} className="block truncate text-sm font-semibold text-amber-600" data-company-rating-badge>
                  ★ <span className="tabular-nums">{rating.avg.toFixed(1)}</span> <span className="font-normal text-mute">· 근무자 후기 {rating.count}개 →</span>
                </Link>
              )}
            </span>
            <Link href="/#jobs" className="shrink-0 text-sm font-semibold text-brand-600">
              전체 공고
            </Link>
          </div>
          {user ? (
            <Link href="/me" className="btn-gray btn-sm w-full">
              {user.name}님 내 근무 보기 →
            </Link>
          ) : (
            <div className="flex gap-2">
              <Link href={`/signup?type=worker&next=${encodeURIComponent(`/?co=${company.id}`)}`} className="btn-primary btn-sm flex-1">
                간편 가입
              </Link>
              <Link href={`/login?next=${encodeURIComponent(`/?co=${company.id}`)}`} className="btn-gray btn-sm flex-1">
                로그인
              </Link>
            </div>
          )}
        </section>
      ) : user ? (
        <Link href="/me" className="card-link mb-5 flex items-center gap-3 px-4 py-3.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{user.name}님, 안녕하세요</span>
            <span className="block truncate text-sm text-sub">
              {upcomingCount + waitingCount === 0
                ? '함께하고 싶은 공고를 골라 지원해 보세요'
                : [upcomingCount > 0 && `확정 ${upcomingCount}건`, waitingCount > 0 && `확정 대기 ${waitingCount}건`].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold text-brand-600">내 근무 →</span>
        </Link>
      ) : (
        <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white shadow-lg shadow-brand-600/20">
          {/* 배경에 천천히 떠다니는 동그라미 */}
          <span aria-hidden className="pointer-events-none absolute -top-12 -right-10 size-44 animate-float rounded-full bg-white/10" />
          <span aria-hidden className="pointer-events-none absolute right-14 -bottom-14 size-28 animate-float rounded-full bg-white/10 [animation-delay:1.4s]" />
          <div className="relative">
            <p className="text-sm font-semibold opacity-80">{APP_NAME}</p>
            <h1 className="mt-1 text-2xl leading-tight font-extrabold">
              행사 단기 알바,
              <br />
              지원부터 정산까지 한&nbsp;번에
            </h1>
            <p className="mt-2 text-sm opacity-90">한 번 가입하면 출퇴근 버튼만 누르면 됩니다. 근로계약서와 급여명세서도 여기서 받아요.</p>
            {!user && (
              <div className="mt-4 flex gap-2">
                <Link href="/signup?type=worker" className="btn bg-white text-brand-700">
                  간편 가입
                </Link>
                <Link href="/login" className="btn bg-white/15 text-white">
                  로그인
                </Link>
              </div>
            )}
            {!user && (
              <Link href="/pro" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-white/90 underline-offset-2 hover:underline">
                🎛️ 음향·조명·영상 전문가나 외주 업체이신가요? →
              </Link>
            )}
            {!user && (
              <Link href="/start" className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-white/90 underline-offset-2 hover:underline">
                🏢 사람을 뽑는 회사인가요? 회사로 시작하기 →
              </Link>
            )}
          </div>
        </section>
      )}

      <h2 id="jobs" className="section-title scroll-mt-20">
        모집 중인 알바 {listed.length > 0 && <span className="text-brand-600">{listed.length}</span>}
      </h2>
      {jobs.length > 0 && (
        <div className="-mt-1 mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              [null, '전체'],
              ['soon', '오늘·내일'],
              ['weekend', '이번 주말'],
              ['week', '7일 안'],
            ] as const
          ).map(([w, label]) => (
            <Link
              key={label}
              href={filterHref(w, avail)}
              scroll={false}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition active:scale-95 ${
                when === w ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'
              }`}
            >
              {label}
            </Link>
          ))}
          <Link
            href={filterHref(when, !avail)}
            scroll={false}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition active:scale-95 ${
              avail ? 'bg-brand-600 text-white' : 'bg-white text-sub ring-1 ring-line'
            }`}
          >
            {avail ? '✓ ' : ''}지원 가능만
          </Link>
          {/* 근무자 후기가 좋은 회사만 (후기 있는 회사가 있을 때) */}
          {user && (good || Object.values(ratings).some((r) => r.avg >= 4)) && (
            <Link
              href={filterHref(when, avail, !good)}
              scroll={false}
              data-good-filter
              aria-pressed={good}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition active:scale-95 ${
                good ? 'bg-amber-500 text-white' : 'bg-white text-sub ring-1 ring-line'
              }`}
            >
              {good ? '✓ ' : '⭐ '}후기 좋은 곳
            </Link>
          )}
        </div>
      )}
      {/* 거르기를 켜면 몇 개가 남았는지 바로 */}
      {jobs.length > 0 && (when || avail || good) && listed.length > 0 && (
        <p key={`${when}-${avail}-${good}`} className="-mt-1 mb-2 animate-pop text-sm text-sub" data-filter-count>
          조건에 맞는 공고 <b className="text-brand-700 tabular-nums">{listed.length}</b>개
        </p>
      )}
      {jobs.length === 0 ? (
        <Empty icon="🔍" sticker="wait" title="지금은 모집 중인 공고가 없어요">
          {company ? (
            <Link href="/#jobs" className="font-semibold text-brand-600">
              다른 회사 공고 보기 →
            </Link>
          ) : (
            '새 공고가 올라오면 단톡방으로 알려 드릴게요.'
          )}
        </Empty>
      ) : listed.length === 0 ? (
        <Empty icon="🗓️" title="조건에 맞는 공고가 없어요">
          <Link href={company ? `/?co=${company.id}#jobs` : '/#jobs'} className="font-semibold text-brand-600">
            전체 공고 보기 →
          </Link>
        </Empty>
      ) : (
        <>
          {/* 지난번에 본 뒤로 새로 올라온 모집 중 공고 (이 휴대폰 기준) */}
          <NewJobsChip createdAts={jobs.filter((j) => j.status === 'open').map((j) => j.created_at)} />
          <div className="stagger space-y-3">
            {listed.map((j) => (
              <JobCard key={j.id} job={j} approved={counts[j.id] ?? 0} myStatus={mine[j.id]} clash={clashes(j)} showNew rating={ratings[j.company_id]} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
