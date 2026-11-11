import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/Icon'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import JobCard from '@/components/JobCard'
import { countApps, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { getUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { isPro } from '@/lib/members'
import { kstDate } from '@/lib/time'
import { workOver } from '@/lib/pay'
import { isUuid } from '@/lib/validate'
import { overlapDay } from '@/lib/overlap'
import { NewJobsChip } from '@/components/NewJobs'
import { companyRating, companyRatings } from '@/lib/community'
import { featureOn } from '@/lib/flags'
import { coworkerCounts } from '@/lib/coworkers'
import PushToggle from '@/components/PushToggle'
import { pushPublicKey } from '@/lib/push'

/** 회사 공고 모음 링크(/?co=회사)를 보내면: 미리보기에 회사 이름 · 모집 중 공고 수 · 그림 */
export async function generateMetadata(props: PageProps<'/'>): Promise<Metadata> {
  const sp = await props.searchParams
  const coId = typeof sp.co === 'string' && isUuid(sp.co) ? sp.co : null
  if (!coId) return {}
  const [{ data: co }, { count }] = await Promise.all([
    db().from('companies').select('company_name').eq('id', coId).eq('active', true).maybeSingle(),
    db().from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', coId).eq('audience', 'worker').eq('status', 'open').gte('end_date', kstDate()),
  ])
  const name = (co as { company_name: string } | null)?.company_name
  if (!name) return {}
  const title = `${name} 모집 공고`
  const description = count ? `지금 모집 중 ${count}개 · 간편가입 후 바로 지원` : '공고가 올라오면 여기에서 바로 지원할 수 있어요'
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', images: [{ url: `/og/company/${coId}`, width: 1200, height: 630, alt: title }] },
  }
}

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
  // 운영자가 '공고에 회사 후기 보이기'를 끄면 별점·후기 거르기를 숨김
  const reviewsOn = await featureOn('job_reviews')
  const rating = company && me && reviewsOn ? await companyRating(company.id).catch(() => null) : null
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
  const [ratings, palCounts] = user
    ? await Promise.all([reviewsOn ? companyRatings(jobs.map((j) => j.company_id)) : Promise.resolve({} as Awaited<ReturnType<typeof companyRatings>>), coworkerCounts(user.id, jobs.map((j) => j.id))])
    : [{} as Awaited<ReturnType<typeof companyRatings>>, {} as Record<string, number>]
  // 회사 공고 모음: 지금 지원받는 공고 수 (모집 마감은 빼고)
  const openCount = jobs.filter((j) => j.status === 'open').length
  const mine: Record<string, string> = {}
  for (const r of myApps) mine[r.job_id] = r.status
  // 회사 공고 모음: 이 회사의 지금 공고 가운데 내가 확정된 것 · 확정을 기다리는 것
  const hereApproved = company ? jobs.filter((j) => mine[j.id] === 'approved').length : 0
  const hereWaiting = company ? jobs.filter((j) => mine[j.id] === 'applied').length : 0
  // 확정·지원한 내 일정과 같은 날 같은 시간대인 공고 (지원 버튼을 누르기 전에 목록에서 미리 알게: 두 군데 겹치기 지원 실수 막기)
  const myShifts = myApps.filter((r) => (r.status === 'approved' || r.status === 'applied') && r.job && r.job.status !== 'cancelled' && r.job.end_date >= today)
  const clashes = (j: JobWithAppStatus) =>
    (!mine[j.id] || mine[j.id] === 'cancelled') && j.status === 'open' && myShifts.some((r) => r.job_id !== j.id && overlapDay(j, { ...r.job!, dates: r.available_dates }))

  // 날짜로 거르기: 오늘·내일 / 이번 주말 / 7일 안 (그리고 지원 가능한 것만)
  const when = (['soon', 'weekend', 'week'] as const).find((w) => w === sp.when) ?? null
  const avail = sp.avail === '1'
  // 근무자 후기 별점 4점 이상인 회사 공고만 (회원)
  const good = sp.good === '1' && !!user && reviewsOn
  const plus = (n: number) => kstDate(new Date(Date.parse(`${today}T12:00:00+09:00`) + n * 86_400_000))
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 일요일
  const sat = dow === 0 ? today : plus(6 - dow)
  const sun = dow === 0 ? today : plus(7 - dow)
  const overlaps = (j: JobWithAppStatus, from: string, to: string) => j.start_date <= to && j.end_date >= from
  const matches = (j: JobWithAppStatus, w: typeof when, a: boolean, g: boolean) => {
    if (w === 'soon' && !overlaps(j, today, plus(1))) return false
    if (w === 'weekend' && !overlaps(j, dow === 0 ? today : sat, sun)) return false
    if (w === 'week' && !overlaps(j, today, plus(7))) return false
    if (a && (j.status !== 'open' || (counts[j.id] ?? 0) >= j.headcount || (mine[j.id] && mine[j.id] !== 'cancelled') || (j.end_date === today && workOver(j, j.end_date)))) return false
    if (g && !((ratings[j.company_id]?.avg ?? 0) >= 4)) return false
    return true
  }
  const listed = jobs.filter((j) => matches(j, when, avail, good))
  const filterHref = (w: string | null, a: boolean, g: boolean = good) => {
    const q = new URLSearchParams()
    if (company) q.set('co', company.id)
    if (w) q.set('when', w)
    if (a) q.set('avail', '1')
    if (g) q.set('good', '1')
    const s = q.toString()
    return s ? `/?${s}#jobs` : '/#jobs'
  }
  // 거른 결과가 없을 때: 조건을 하나 풀면 몇 개가 있는지 (빈 화면에서 막히지 않게 · 최대 2개)
  const loosen: { label: string; n: number; href: string }[] = []
  if (listed.length === 0 && jobs.length > 0) {
    const count = (w: typeof when, a: boolean, g: boolean) => jobs.filter((j) => matches(j, w, a, g)).length
    if (when) {
      for (const w2 of when === 'week' ? [null] : (['week', null] as const)) {
        const n = count(w2, avail, good)
        if (n > 0) {
          loosen.push({ label: w2 === 'week' ? '7일 안' : '날짜 전체', n, href: filterHref(w2, avail) })
          break
        }
      }
    }
    if (avail && count(when, false, good) > 0) loosen.push({ label: '마감 포함', n: count(when, false, good), href: filterHref(when, false) })
    if (good && count(when, avail, false) > 0) loosen.push({ label: '후기 조건 빼고', n: count(when, avail, false), href: filterHref(when, avail, false) })
    loosen.splice(2)
  }
  // 오늘 확정된 근무가 있으면 맨 위에서 바로 출퇴근 화면으로 (카톡 링크로 들어와도 한 번에)
  const todayJob = jobs.find((j) => mine[j.id] === 'approved' && j.start_date <= today && j.end_date >= today)
  // 오늘 근무에 아직 서명 안 한 서류가 있으면 카드가 '서명'으로 바로 (현장에 가서야 근무 시작이 잠긴 걸 알지 않게)
  // 오늘 출퇴근 상태도 함께 (근무 중·마침이면 카드 문구를 지금 상태에 맞게 — '출퇴근 전'이라고 잘못 말하지 않게)
  const [todaySignId, todayAtt] =
    todayJob && user
      ? await Promise.all([
          db()
            .from('signed_docs')
            .select('id, job_id, status')
            .eq('user_id', user.id)
            .eq('job_id', todayJob.id)
            .eq('status', 'pending')
            .then(
              (r) => ((r.data ?? []) as { id: string; job_id: string; status: string }[]).find((d) => d.job_id === todayJob.id && d.status === 'pending')?.id ?? null,
              () => null,
            ),
          db()
            .from('attendance')
            .select('job_id, work_date, clock_in, clock_out')
            .eq('user_id', user.id)
            .eq('job_id', todayJob.id)
            .eq('work_date', today)
            .then(
              (r) => ((r.data ?? []) as { job_id: string; work_date: string; clock_in: string | null; clock_out: string | null }[]).find((a) => a.job_id === todayJob.id && a.work_date === today) ?? null,
              () => null,
            ),
        ])
      : [null, null]
  const todayState: 'before' | 'working' | 'done' = todayAtt?.clock_out ? 'done' : todayAtt?.clock_in ? 'working' : 'before'
  // 출근 기록 없이 오늘 근무 시간이 다 지났으면 '근무가 있어요'가 아니라 '지났어요' (내 근무에서 담당자에게 알리기)
  const shiftOver = !!todayJob && todayState === 'before' && workOver(todayJob, today)
  const todayLabel = todaySignId
    ? todayState === 'before'
      ? '출퇴근 전 서명이 남았어요'
      : todayState === 'working'
        ? '근무 중 · 서명이 남았어요'
        : '근무 끝 · 서명이 남았어요'
    : todayState === 'working'
      ? '지금 근무 중이에요'
      : shiftOver
        ? '오늘 근무 시간이 지났어요'
        : '오늘 근무가 있어요'
  // 로그인한 근무자: 소개 배너 대신 한 줄 인사 + 내 근무 현황 (공고 목록이 첫 화면에 보이게)
  const upcomingCount = jobs.filter((j) => mine[j.id] === 'approved' && j.id !== todayJob?.id).length
  const waitingCount = jobs.filter((j) => mine[j.id] === 'applied').length

  return (
    <>
      <Flash m={sp.m} />
      {todayJob && todayState === 'done' && !todaySignId ? (
        // 오늘 근무를 마침: 할 일이 없으니 조용한 흰 카드 (지난 근무로)
        <Link href="/me/history" data-today-hero data-today-state="done" className="card-link mb-4 flex animate-pop items-center gap-3 p-4">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Icon name="check" className="text-xl" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-emerald-700">오늘 근무를 마쳤어요 · 수고했어요</span>
            <span className="block truncate font-bold">{todayJob.title}</span>
          </span>
          <span className="shrink-0 text-sm font-bold text-brand-600">내역 →</span>
        </Link>
      ) : (
        todayJob && (
          // 오늘 근무: 초록→청록 그라데이션 카드 (할 일이 있을 때만 · 빛 번짐 없이)
          <Link
            href={todaySignId ? `/docs/${todaySignId}` : '/me'}
            data-today-hero
            data-today-state={todayState}
            data-today-sign={todaySignId ? '' : undefined}
            className="relative mb-4 flex animate-pop items-center gap-3 overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#10b981_0%,#0d9488_100%)] p-4 text-white transition active:scale-[0.985]"
          >
            <span aria-hidden className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/35">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 2.5M9.5 2.5h5" />
              </svg>
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white/85">{todayLabel}</span>
              <span className="block truncate font-bold">{todayJob.title}</span>
              <span className="block truncate text-sm text-white/80">
                {scheduleText(todayJob)}
                {todayJob.location_name && ` · ${todayJob.location_name}`}
              </span>
            </span>
            {/* 서명이 먼저면 버튼이 한 번 톡 튀어 눈에 띄게 (움직임 줄이기면 그대로) */}
            <span className={`relative shrink-0 rounded-full bg-[#fff] px-3 py-1.5 text-sm font-bold text-teal-700 ${todaySignId ? 'animate-bump [animation-delay:450ms]' : ''}`}>
              {todaySignId ? '서명 →' : shiftOver ? '확인 →' : '출퇴근 →'}
            </span>
          </Link>
        )
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
            hereApproved + hereWaiting > 0 ? (
              // 이 회사에 이미 지원한 사람: 지금 어디까지 왔는지 (확정 · 확정 대기) 한 줄로
              <Link href="/me" className="flex items-center justify-between gap-2 rounded-xl bg-bg px-3.5 py-2.5 text-sm transition active:scale-[0.98]" data-company-mine>
                <span className="min-w-0 truncate">
                  <b className="font-semibold">내 지원</b>
                  {hereApproved > 0 && (
                    <>
                      {' · '}
                      <span className="font-semibold text-emerald-600">확정 {hereApproved}건</span>
                    </>
                  )}
                  {hereWaiting > 0 && ` · 확정 대기 ${hereWaiting}건`}
                </span>
                <span className="shrink-0 font-bold whitespace-nowrap text-brand-600">내 근무 →</span>
              </Link>
            ) : (
              <Link href="/me" className="btn-gray btn-sm w-full">
                {user.name}님 내 근무 보기 →
              </Link>
            )
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
        // 로그인 전: 짧은 소개 (인사이트: 비회원은 거의 홈에서 바로 나감 → 공고가 첫 화면에 더 많이 보이게 줄임 · 가입 안내는 목록 끝에)
        <section
          data-home-intro
          className="relative mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 px-5 py-4 text-white"
        >
          <span aria-hidden className="pointer-events-none absolute -top-12 -right-10 size-36 animate-float rounded-full bg-white/10" />
          <div className="relative">
            <h1 className="text-xl leading-snug font-extrabold text-balance">
              행사 단기 알바,
              <br />
              지원부터 정산까지 한&nbsp;번에
            </h1>
            <div className="mt-2.5 flex items-center gap-3">
              {/* 두 줄로 딱 나눔 (좁은 화면에서 '계약서·'처럼 어색하게 끊기지 않게) */}
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/85">
                <span className="block whitespace-nowrap">1분이면 가입 끝</span>
                <span className="block whitespace-nowrap">출퇴근·급여도 앱 하나로</span>
              </p>
              <Link href="/signup?type=worker" className="btn btn-sm shrink-0 bg-white text-brand-700" data-track="홈 간편 가입(위)">
                간편 가입
              </Link>
            </div>
          </div>
        </section>
      )}

      <h2 id="jobs" className="section-title scroll-mt-20">
        모집 중인 알바 {listed.length > 0 && <span className="text-brand-600">{listed.length}</span>}
      </h2>
      {jobs.length > 0 && (
        <div className="fade-x -mt-1 mb-3 flex gap-1.5 overflow-x-auto pb-1" data-chip-row>
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
              data-track={`홈 거르기: ${label}`}
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
            data-track="홈 거르기: 지원 가능만"
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
        <div className="space-y-3" data-home-nojobs>
          <Empty icon="🔍" sticker="wait" title="지금은 모집 중인 공고가 없어요">
            {company ? (
              <Link href="/#jobs" className="font-semibold text-brand-600">
                다른 회사 공고 보기 →
              </Link>
            ) : (
              '새 공고가 올라오면 단톡방으로 알려 드릴게요.'
            )}
          </Empty>
          {/* 이용 기록: 공고가 없는 날 홈에서 그대로 나가는 사람이 많음 → 알림을 안 켠 회원에게는 바로 켜는 카드 (켰으면 안 보임) */}
          {user && <PushToggle publicKey={pushPublicKey()} variant="card" reason="모집·확정을 바로 알려요" />}
        </div>
      ) : listed.length === 0 ? (
        <Empty icon="🗓️" title="조건에 맞는 공고가 없어요">
          {loosen.length > 0 ? (
            // 조건을 하나 풀면 있는 곳으로 바로 (몇 개인지 함께)
            <span className="mt-1 flex flex-wrap justify-center gap-2" data-loosen>
              {loosen.map((l, i) => (
                <Link
                  key={l.label}
                  href={l.href}
                  scroll={false}
                  className="chip-primary animate-pop whitespace-nowrap tabular-nums"
                  style={{ animationDelay: `${i * 80}ms` }}
                  data-track={`홈 빈 결과: ${l.label}`}
                >
                  {l.label} · {l.n}개 →
                </Link>
              ))}
            </span>
          ) : (
            <Link href={company ? `/?co=${company.id}#jobs` : '/#jobs'} className="font-semibold text-brand-600">
              전체 공고 보기 →
            </Link>
          )}
        </Empty>
      ) : (
        <>
          {/* 지난번에 본 뒤로 새로 올라온 모집 중 공고 (이 휴대폰 기준) */}
          <NewJobsChip createdAts={jobs.filter((j) => j.status === 'open').map((j) => j.created_at)} />
          <div className="stagger space-y-3">
            {listed.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                approved={counts[j.id] ?? 0}
                myStatus={mine[j.id]}
                clash={clashes(j)}
                showNew
                rating={ratings[j.company_id]}
                pals={palCounts[j.id] ?? 0}
                track={user ? '홈 공고 카드' : '홈 공고 카드(비회원)'}
              />
            ))}
          </div>
        </>
      )}

      {/* 로그인 전: 목록을 다 본 자리(비회원이 보통 여기까지 내려 보고 나감)에 가입 안내 · 전문가·회사 안내 */}
      {!user && (
        <section data-home-join className="mt-6 space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-line">
          <div>
            {/* 공고가 없는 날엔 '마음에 드는 공고가 있나요?'가 맞지 않음 → 미리 가입해 둘 이유를 말함 */}
            <p className="font-bold" data-join-title>
              {jobs.length === 0 ? '미리 가입해 두세요' : '마음에 드는 공고가 있나요?'}
            </p>
            <p className="mt-0.5 text-sm text-sub">
              {jobs.length === 0 ? '새 공고가 올라오면 바로 지원할 수 있어요. 이렇게 진행돼요.' : '가입은 1분이면 끝나요. 지원 뒤 확정되면 이렇게 진행돼요.'}
            </p>
          </div>
          <ol className="grid grid-cols-3 gap-1.5 text-center text-xs font-semibold text-sub" data-home-steps>
            {['공고 보고 지원', '앱에서 계약서 서명', '출퇴근 누르면 급여 정산'].map((t, i) => (
              <li key={t} className="flex flex-col items-center gap-1 rounded-2xl bg-bg px-1.5 py-2.5">
                <span aria-hidden className="grid size-6 place-items-center rounded-full bg-brand-600 text-[11px] font-extrabold text-white tabular-nums">
                  {i + 1}
                </span>
                <span className="leading-snug text-balance">{t}</span>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <Link
              href={`/signup?type=worker${company ? `&next=${encodeURIComponent(`/?co=${company.id}`)}` : ''}`}
              className="btn-primary flex-1"
              data-track="홈 1분 가입하기(아래)"
            >
              1분 가입하기
            </Link>
            <Link href={`/login${company ? `?next=${encodeURIComponent(`/?co=${company.id}`)}` : ''}`} className="btn-gray shrink-0" data-track="홈 로그인(아래)">
              로그인
            </Link>
          </div>
          {!company && (
            <div className="space-y-1 border-t border-line pt-3 text-sm font-semibold text-sub">
              <Link href="/pro" className="flex items-center gap-1.5 hover:text-ink" data-track="홈 전문가 안내">
                🎛️ 음향·조명·영상 전문가나 외주 업체이신가요? →
              </Link>
              <Link href="/start" className="flex items-center gap-1.5 hover:text-ink" data-track="홈 회사로 시작하기">
                🏢 사람을 뽑는 회사인가요? 회사로 시작하기 →
              </Link>
            </div>
          )}
        </section>
      )}
    </>
  )
}
