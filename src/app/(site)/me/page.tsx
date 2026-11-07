import type { Metadata } from 'next'
import { canWrite, myReviewedJobs, newCommentsOnMine, reviewNudge } from '@/lib/community'
import LevelCard from '@/components/LevelCard'
import { computeXp, shiftFacts } from '@/lib/xp'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import { ShowMore } from '@/components/Fold'
import { InstallBanner } from '@/components/InstallGuide'
import PhotoPrompt from '@/components/PhotoPrompt'
import PushNudge from '@/components/PushNudge'
import PushToggle from '@/components/PushToggle'
import { APP_STATUS } from '@/components/JobCard'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { ClockPanel, FixRequest, ForgotClockOut, FullTimeRequest, LateNotice, StartCountdown } from '@/components/worker'
import AutoRefresh from '@/components/AutoRefresh'
import { db, must } from '@/lib/db'
import { withWeeklyPay } from '@/lib/weekly'
import { scheduleText } from '@/lib/docs'
import { mapLinks } from '@/lib/map'
import PrepChecklist from '@/components/PrepChecklist'
import Icon from '@/components/Icon'
import { won } from '@/lib/format'
import { answerOvertime, answerShift } from '@/app/actions/worker'
import { calcDay, workingToday, OT_ASK_MIN, scheduledEnd, settle, shiftOf } from '@/lib/pay'
import { pushPublicKey } from '@/lib/push'
import { requireUser } from '@/lib/session'
import { isFullTimeAsk, parseFix, parseLate, pendingFix, SIGNAL, signalOf } from '@/lib/signals'
import { dateList, fmtDate, fmtDateRange, hhmm, kstAt, kstDate, kstTime, minutesText } from '@/lib/time'
import type { Application, Attendance, Job, ShiftChange, SignedDoc } from '@/lib/types'
import { canOpenJobDocs, docInquiryHref } from '@/lib/doc-access'
import { contractNameOf } from '@/lib/members'

export const metadata: Metadata = { title: '내 근무' }

/** 근로계약서를 종이·다른 서비스(모두싸인 등)로 받는 공고: 아직 안 받았으면 안내 */
function ContractNote({ job, received, compact = false }: { job: Job; received: string | null; compact?: boolean }) {
  if (!job.contract_method || job.contract_method === 'app' || received) return null
  // 전문가 의뢰는 용역계약서 (근로자로 오해하지 않게)
  const name = contractNameOf(job.audience)
  if (compact) {
    return (
      <p className="mt-1 text-xs font-semibold text-amber-700">
        📝 {name} {job.contract_method === 'paper' ? '현장에서 종이로 작성' : '전자계약(모두싸인 등)으로 서명 필요'}
      </p>
    )
  }
  return job.contract_method === 'paper' ? (
    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      📝 <b>{name}는 종이로 작성해요.</b> 근무 시작 전에 현장 담당자에게 받아 서명해 주세요.
    </p>
  ) : (
    <div className="space-y-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-100">
      <p>
        ✍️ <b>{name}를 전자계약(모두싸인 등)으로 서명해 주세요.</b>{' '}
        {job.contract_url ? '' : '문자·카카오톡으로 온 서명 링크를 확인해 주세요.'}
      </p>
      {job.contract_url && (
        <a href={job.contract_url} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
          서명하러 가기 →
        </a>
      )}
    </div>
  )
}

type AppWithJob = Application & { job: Job & { company?: { company_name: string } | null } }

/** 어느 회사 근무인지 (해피워크는 여러 회사가 공고를 올리므로, 여러 회사 일을 하는 근무자가 헷갈리지 않게) */
function CompanyName({ job, className = '' }: { job: { company?: { company_name: string } | null }; className?: string }) {
  const name = job.company?.company_name
  return name ? <p className={`truncate text-xs font-semibold text-sub ${className}`}>🏢 {name}</p> : null
}

export default async function MePage(props: PageProps<'/me'>) {
  const sp = await props.searchParams
  const user = await requireUser('/me')
  // 외주 업체는 근무(출퇴근)가 없으므로 전문가 화면으로
  if (user.memberType === 'vendor' && user.role !== 'admin') redirect('/pro')
  // 전문가: '근무' 대신 '일', 빈 화면에서 전문가 의뢰 목록으로
  const pro = user.memberType === 'expert' && user.role !== 'admin'
  const today = kstDate()

  // 최근에 일한 공고 후기 안내 (다른 것과 함께 읽음)
  const nudgeP = canWrite(user) && !pro ? reviewNudge(user.id) : Promise.resolve(null)
  // 커뮤니티를 마지막으로 본 뒤 내 글에 달린 새 댓글
  const seenRaw = (await cookies()).get('cm_seen')?.value
  const newCommentsP = canWrite(user) ? newCommentsOnMine(user.id, seenRaw ? decodeURIComponent(seenRaw) : null) : Promise.resolve(null)
  const [apps, atts, docs, me, adminJobMsgs, mySignals, shifts] = await Promise.all([
    db()
      .from('applications')
      .select('*, job:jobs(*, company:companies(company_name))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then((r) => (must(r) as AppWithJob[]).filter((a) => a.job)),
    db()
      .from('attendance')
      .select('*')
      .eq('user_id', user.id)
      .order('work_date', { ascending: false })
      .then((r) => must(r) as Attendance[]),
    db()
      .from('signed_docs')
      .select('id, job_id, title, status, signed_at')
      .eq('user_id', user.id)
      .neq('status', 'void')
      .then((r) => must(r) as Pick<SignedDoc, 'id' | 'job_id' | 'title' | 'status' | 'signed_at'>[]),
    db()
      .from('users')
      .select('photo_at, bank_account_enc, emergency_phone, address, careers')
      .eq('id', user.id)
      .maybeSingle()
      .then((r) => r.data as { photo_at: string | null; bank_account_enc: string | null; emergency_phone: string | null; address: string | null; careers: unknown } | null),
    // 담당자가 공고 확정자에게 보낸 공지 (오늘 근무 카드에 최근 것 하나)
    db()
      .from('messages')
      .select('job_id, body, created_at')
      .eq('thread_user_id', user.id)
      .eq('from_admin', true)
      .not('job_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30)
      .then((r) => must(r) as { job_id: string; body: string; created_at: string }[]),
    // 오늘 내가 담당자에게 보낸 현장 알림 (늦어요 등)
    db()
      .from('messages')
      .select('job_id, body, created_at')
      .eq('thread_user_id', user.id)
      .eq('from_admin', false)
      .not('job_id', 'is', null)
      .gte('created_at', kstAt(today, '00:00').toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
      .then((r) => (must(r) as { job_id: string; body: string; created_at: string }[]).filter((m) => kstDate(m.created_at) === today)),
    // 담당자가 바꾼 근무시간: 답을 기다리는 것 + 오늘 동의한 것
    db()
      .from('shift_changes')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'agreed'])
      .order('created_at', { ascending: false })
      .limit(30)
      .then((r) => (must(r) as ShiftChange[]).sort((a, b) => b.created_at.localeCompare(a.created_at))),
  ])
  const notices = adminJobMsgs.filter((m) => m.body.startsWith('📢 공지') || signalOf(m.body) === 'change')
  // 오늘 보낸 기록 정정 요청 중 담당자가 아직 답하지 않은 것 (공고별)
  const fixSent = (jobId: string) => {
    const req = pendingFix(
      [
        ...mySignals.filter((m) => m.job_id === jobId).map((m) => ({ ...m, from_admin: false })),
        ...adminJobMsgs.filter((m) => m.job_id === jobId).map((m) => ({ ...m, from_admin: true })),
      ],
      today,
    )
    const f = req && parseFix(req.body)
    return req && f ? { ...f, at: kstTime(req.created_at), full: isFullTimeAsk(req.body) && f.field === 'out' } : null
  }
  const pendingShifts = shifts.filter((c) => c.status === 'pending')
  // 오늘 적용되는 시간 (동의한 변경이 있으면 그것)
  const todayShift = (job: Job, att?: Attendance | null) => {
    if (att?.sched_start && att.sched_end) return shiftOf(job, att)
    const c = shifts.find((x) => x.job_id === job.id && x.status === 'agreed' && x.work_date === today)
    return c ? { start_time: c.start_time, end_time: c.end_time } : shiftOf(job)
  }
  const lateSent = new Map<string, { minutes: number; eta: string; at: string }>()
  for (const m of mySignals) {
    const l = signalOf(m.body) === 'late' ? parseLate(m.body) : null
    if (l && !lateSent.has(m.job_id)) lateSent.set(m.job_id, { ...l, at: kstTime(m.created_at) })
  }
  // 오늘 보낸 출근 확인 요청 (위치 확인이 안 될 때): 공고별 마지막 요청 시각 — 출근 기록이 생기면 화면에서 사라짐
  const arriveSent = new Map<string, string>()
  for (const m of mySignals) if (signalOf(m.body) === 'arrive' && !arriveSent.has(m.job_id)) arriveSent.set(m.job_id, kstTime(m.created_at))
  const latestNotice = new Map<string, { body: string; created_at: string }>()
  for (const n of notices) if (!latestNotice.has(n.job_id)) latestNotice.set(n.job_id, n)
  const photoAt = me?.photo_at ?? null
  const hasAccount = !!me?.bank_account_enc

  const openAtt = atts.find((a) => !a.clock_out) ?? null
  const approved = apps.filter((a) => a.status === 'approved')
  const todayApps = approved.filter(
    (a) => (a.job.start_date <= today && a.job.end_date >= today) || openAtt?.job_id === a.job_id,
  )
  // 여러 날 행사는 사람마다 근무일이 다름 (고른 날 중 오늘 이후 첫날)
  const firstDay = (a: AppWithJob) => (a.available_dates ?? [a.job.start_date]).filter((d) => d >= today).sort()[0] ?? a.job.start_date
  const upcoming = approved.filter((a) => a.job.start_date > today).sort((a, b) => firstDay(a).localeCompare(firstDay(b)))
  const nextApp = upcoming[0] ?? null
  const dLabel = (d: string) => {
    const n = Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000)
    return n === 1 ? '내일' : `D-${n}`
  }
  const waiting = apps.filter((a) => a.status === 'applied' && a.job.end_date >= today)
  // 이번 주 내 근무 한눈에: 오늘부터 7일, 근무가 있는 날은 파랗게 (누르면 그 근무 카드로)
  const week = Array.from({ length: 7 }, (_, i) => kstDate(new Date(Date.parse(`${today}T12:00:00+09:00`) + i * 86_400_000)))
  const workDays = (a: AppWithJob) => a.available_dates ?? dateList(a.job.start_date, a.job.end_date)
  const weekWork = week.map((d) => approved.filter((a) => a.job.status !== 'cancelled' && workDays(a).includes(d)))
  const weekCount = weekWork.filter((w) => w.length > 0).length
  // 서류는 근무가 확정된 동안만 열 수 있음 (지원 취소·확정 되돌림이면 관리자 문의)
  const appStatus = new Map(apps.map((a) => [a.job_id, a.status]))
  const docOpen = (jobId: string) => canOpenJobDocs(appStatus.get(jobId))
  const pendingDocs = docs.filter((d) => d.status === 'pending' && docOpen(d.job_id))
  const jobsById = new Map(apps.map((a) => [a.job_id, a.job]))
  // 서류 목록 아랫줄: 어느 회사 · 어느 공고 서류인지 (여러 회사 근로계약서가 같은 이름이어도 구분되게)
  const docJobLine = (jobId: string) => {
    const j = jobsById.get(jobId)
    return [j?.company?.company_name, j?.title].filter(Boolean).join(' · ')
  }
  const weekAgo = kstDate(new Date(Date.now() - 7 * 86_400_000).toISOString())
  const otItems = atts
    .filter((a) => a.clock_out && !a.paid)
    .map((a) => {
      const job = jobsById.get(a.job_id)
      if (!job) return null
      const d = calcDay(job, a)
      const recentReject = a.ot_status === 'rejected' && a.ot_by === 'admin' && a.work_date >= weekAgo
      return d.afterMin >= OT_ASK_MIN && (d.otOpen || recentReject) ? { a, job, afterMin: d.afterMin } : null
    })
    .filter((x) => x !== null)

  // 근무 내역: 공고별 정산 (주휴수당 포함 · 회사가 정산할 금액과 같게)
  const attsPay = await withWeeklyPay(atts)
  const history = [...new Set(atts.map((a) => a.job_id))]
    .map((jobId) => {
      const job = jobsById.get(jobId)
      if (!job) return null
      const rows = attsPay.filter((a) => a.job_id === jobId)
      const s = settle(job, rows.map((r) => calcDay(job, r)))
      // 오늘 아직 근무 중이면 '종료 기록 없음'이 아니라 '오늘 근무 중' (퇴근하면 그날이 계산됨)
      const live = workingToday(rows, today)
      return { job, rows, s, live, paid: rows.every((r) => r.paid) }
    })
    .filter((x) => x !== null)

  // 계좌·사진 등록 안내 (근무 날에는 오늘의 근무 아래에) — 둘 다면 한 카드에 두 줄로 (위아래로 덜 길게)
  const nags = [
    // 근무가 잡혔거나 일한 적이 있는데 계좌가 없으면 (급여를 못 받음)
    !hasAccount && (approved.length > 0 || atts.length > 0)
      ? { key: 'account', href: '/me/profile#bank_account', icon: 'card' as const, tone: 'bg-rose-50 text-rose-600', title: '급여 계좌를 등록해 주세요', sub: '급여를 받으려면 꼭 필요해요', go: '등록' }
      : null,
    !photoAt ? { key: 'photo', href: '/me/profile#photo', icon: 'camera' as const, tone: 'bg-brand-50 text-brand-600', title: '얼굴 사진을 올려 주세요', sub: '현장 담당자가 알아보기 쉬워요', go: '올리기' } : null,
  ].filter((n) => n !== null)
  const profileNags = nags.length ? (
    <div className="card divide-y divide-line overflow-hidden p-0" data-profile-nags>
      {nags.map((n) => (
        <Link key={n.key} href={n.href} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-bg">
          <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-xl text-lg ${n.tone}`}>
            <Icon name={n.icon} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{n.title}</span>
            <span className="block truncate text-[13px] text-sub">{n.sub}</span>
          </span>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-brand-600">{n.go} →</span>
        </Link>
      ))}
    </div>
  ) : null

  const [nudge, newComments, reviewedJobs] = await Promise.all([
    nudgeP,
    newCommentsP,
    // 레벨 카드의 '후기' 점수 (못 읽으면 0)
    !pro && user.role !== 'admin' ? myReviewedJobs(user.id).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
  ])
  // 병아리 레벨 (아르바이트만 · 기록으로 계산, 저장하지 않음)
  const xp =
    !pro && user.role !== 'admin'
      ? computeXp({
          shifts: atts.map((a) => {
            const job = jobsById.get(a.job_id)
            const start = a.sched_start ?? job?.start_time
            return shiftFacts(a, start ? kstAt(a.work_date, start) : null)
          }),
          signedDocs: docs.filter((d) => d.status === 'signed').length,
          reviews: reviewedJobs.size,
          profileComplete: !!(me?.photo_at && me.bank_account_enc && me.emergency_phone && me.address && Array.isArray(me.careers) && me.careers.length > 0),
        })
      : null
  return (
    <div className="space-y-5">
      <Flash m={sp.m} />
      {/* 근무 날·답을 기다리는 일이 있으면: 담당자의 출근 처리·시간 변경·정정 결과가 새로 고치지 않아도 보이게 */}
      {(todayApps.length > 0 || pendingShifts.length > 0) && (
        // 출근 확인을 요청해 두었으면 담당자가 처리하는 대로 빨리 바뀌게 (20초)
        <AutoRefresh seconds={todayApps.some((a) => arriveSent.has(a.job_id) && !atts.some((t) => t.job_id === a.job_id && t.work_date === today)) ? 20 : 60} quiet />
      )}
      <InstallBanner />
      {/* 아직 알림을 안 켰으면 (켰거나 지원 안 되는 기기면 안 보임) */}
      <PushToggle publicKey={pushPublicKey()} variant="card" />
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-600">{fmtDate(today)}</p>
          <h1 className="text-[26px] leading-tight font-extrabold">{user.name}님, 안녕하세요</h1>
        </div>
        <Link href="/me/profile" className="btn-gray btn-sm">
          내 정보
        </Link>
      </div>
      {/* 담당자가 근무시간을 바꿨을 때: 계속하시겠습니까? */}
      {pendingShifts.length > 0 && (
        <section className="card animate-pop space-y-3 bg-brand-50/40 ring-brand-100">
          <div>
            <h2 className="font-bold">🕒 근무시간이 바뀌었어요</h2>
            <p className="text-sm text-sub">바뀐 시간으로 계속 근무하실 수 있는지 알려 주세요. 동의하면 바뀐 시간까지 급여가 계산돼요.</p>
          </div>
          {pendingShifts.map((c) => {
            const job = jobsById.get(c.job_id)
            const ext = hhmm(c.start_time) === hhmm(c.prev_start) && hhmm(c.end_time) > hhmm(c.prev_end)
            return (
              <div key={c.id} className="space-y-2.5 rounded-xl bg-white p-3.5 text-sm">
                <p className="font-semibold">
                  {c.work_date ? fmtDate(c.work_date) : '전체 일정'} · {job?.title ?? '근무'}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-base">
                  <span className="text-mute line-through">
                    {hhmm(c.prev_start)}~{hhmm(c.prev_end)}
                  </span>
                  <span aria-hidden>→</span>
                  <b className="text-brand-700">
                    {hhmm(c.start_time)}~{hhmm(c.end_time)}
                  </b>
                  {ext && <span className="badge bg-brand-600 text-white">연장</span>}
                </p>
                {c.reason && <p className="text-sub">사유: {c.reason}</p>}
                <p className="font-bold">계속하시겠습니까?</p>
                <div className="grid grid-cols-2 gap-2">
                  <form action={answerShift.bind(null, c.id, 'agree')}>
                    <SubmitButton className="btn-primary w-full" pendingText="처리 중…">
                      네, 계속할게요
                    </SubmitButton>
                  </form>
                  <form action={answerShift.bind(null, c.id, 'decline')}>
                    <ConfirmSubmit
                      className="btn-gray w-full"
                      confirmText={c.work_date ? `원래 ${hhmm(c.prev_end)}에 마칠까요?` : '근무 확정이 취소돼요. 괜찮나요?'}
                    >
                      아니요, 어려워요
                    </ConfirmSubmit>
                  </form>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* 계약 종료 시각 이후로 기록된 근무: 서로 확인해야 급여에 들어감 */}
      {otItems.length > 0 && (
        <section className="card animate-pop space-y-3 bg-amber-50/50 ring-amber-200/70">
          <div>
            <h2 className="font-bold">⏱ 계약 시간 이후 근무 확인</h2>
            <p className="text-sm text-sub">계약 종료 시각 이후 시간은 담당자와 서로 확인한 뒤에만 급여에 들어가요.</p>
          </div>
          {otItems.map(({ a, job, afterMin }) => (
            <div key={a.id} className="space-y-2 rounded-xl bg-white p-3.5 text-sm">
              <p className="font-semibold">
                {fmtDate(a.work_date)} · {job.title}
              </p>
              <p className="text-sub">
                계약 종료 {hhmm(shiftOf(job, a).end_time)} 이후 <b className="text-ink">{minutesText(afterMin)}</b>이 더 기록됐어요. 지금은{' '}
                {hhmm(shiftOf(job, a).end_time)}까지만 계산돼 있어요.
              </p>
              {!a.ot_status ? (
                <div className="flex flex-wrap gap-2">
                  <form action={answerOvertime.bind(null, a.id, 'request')}>
                    <SubmitButton className="btn-primary btn-sm" pendingText="보내는 중…">
                      연장 근무했어요 · 확인 요청
                    </SubmitButton>
                  </form>
                  <form action={answerOvertime.bind(null, a.id, 'decline')}>
                    <SubmitButton className="btn-gray btn-sm" pendingText="처리 중…">
                      아니요, {hhmm(shiftOf(job, a).end_time)}에 끝났어요
                    </SubmitButton>
                  </form>
                </div>
              ) : a.ot_status === 'pending' && a.ot_by === 'worker' ? (
                <p className="font-semibold text-amber-700">연장 {minutesText(a.ot_minutes)} 확인 요청함 · 담당자 확인을 기다리는 중</p>
              ) : a.ot_status === 'pending' && a.ot_by === 'admin' ? (
                <div className="space-y-2">
                  <p className="font-semibold text-brand-700">담당자가 연장 {minutesText(Math.min(a.ot_minutes, afterMin))}을 인정했어요. 맞으면 확인을 눌러 주세요.</p>
                  <div className="flex flex-wrap gap-2">
                    <form action={answerOvertime.bind(null, a.id, 'accept')}>
                      <SubmitButton className="btn-primary btn-sm" pendingText="확인 중…">
                        맞아요, 확인
                      </SubmitButton>
                    </form>
                    <Link href="/me/chat" className="btn-gray btn-sm">
                      다르면 문의하기
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-rose-600">
                  담당자가 연장을 인정하지 않았어요.{' '}
                  <Link href="/me/chat" className="font-semibold underline">
                    문의하기
                  </Link>
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {pendingDocs.length > 0 && (
        // 흰 카드 + 작은 아이콘 (안내 문장은 오늘의 근무 칸에 이미 있어 한 번만)
        <section className="card animate-pop" data-sign-card>
          <h2 className="mb-2.5 flex items-center gap-1.5 font-bold">
            <Icon name="pen" className="text-amber-600" />
            서명할 서류가 {pendingDocs.length}건 있어요
          </h2>
          <div className="space-y-2">
            {pendingDocs.map((d) => (
              <Link key={d.id} href={`/docs/${d.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3 font-semibold transition active:scale-[0.98]">
                <span className="min-w-0">
                  <span className="block">{d.title}</span>
                  <span className="block truncate text-xs font-medium text-mute">{docJobLine(d.job_id)}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-brand-600">서명 →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 사진이 없으면 (사진 필수 전에 가입한 사람 포함) 열 때 등록 창을 띄우고, 카드로도 계속 안내 */}
      {!photoAt && user.role === 'worker' && <PhotoPrompt userId={user.id} name={user.name} />}
      {/* 알림을 안 켰으면 켜기 권유 (사진 등록 창이 떠 있으면 그 뒤에, '나중에'면 하루 쉼) */}
      <PushNudge publicKey={pushPublicKey()} reason="알림을 켜야 확정 소식을 놓치지 않아요" />
      {/* 근무 날에는 출퇴근 버튼이 먼저 보이게 계좌·사진 안내를 오늘의 근무 아래로 */}
      {todayApps.length === 0 && profileNags}
      {/* 병아리 레벨 카드는 지금 할 일(시간 변경 답·연장 확인·서명·계좌·사진) 다음에 (재미용이라 할 일을 밀어내지 않게) */}
      {xp && <LevelCard s={xp} />}

      {weekCount > 0 && (
        <section aria-label="이번 주 내 근무" data-week>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">이번 주 내 {pro ? '일' : '근무'}</h2>
            <span className="text-sm font-semibold text-brand-700">{weekCount}일</span>
          </div>
          <ol className="grid grid-cols-7 gap-1">
            {week.map((d, i) => {
              const w = weekWork[i]
              const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
              const label = ['일', '월', '화', '수', '목', '금', '토'][dow]
              const cls = w.length
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 active:scale-95'
                : `bg-white ring-1 ring-line ${i === 0 ? 'ring-2 ring-brand-300' : ''} ${dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-brand-500' : 'text-sub'}`
              const inner = (
                <>
                  <span className="text-[11px] leading-none font-semibold opacity-80">{i === 0 ? '오늘' : label}</span>
                  <span className="text-base leading-tight font-extrabold tabular-nums">{Number(d.slice(8))}</span>
                  <span aria-hidden className={`size-1.5 rounded-full ${w.length ? 'bg-white' : 'bg-transparent'}`} />
                </>
              )
              return (
                <li key={d}>
                  {w.length ? (
                    <a
                      href={i === 0 || todayApps.some((t) => t.id === w[0].id) ? '#today-work' : `#work-${w[0].id}`}
                      aria-label={`${fmtDate(d)} ${w.map((x) => x.job.title).join(', ')}`}
                      className={`flex animate-pop flex-col items-center gap-1 rounded-xl py-2 transition ${cls}`}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      {inner}
                    </a>
                  ) : (
                    <span className={`flex flex-col items-center gap-1 rounded-xl py-2 ${cls}`}>{inner}</span>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* 내 커뮤니티 글에 새 댓글 */}
      {newComments && (
        <Link href={`/community/${newComments.postId}`} className="card-link flex animate-pop items-center gap-3 p-4" data-new-comments>
          <span aria-hidden className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-xl text-brand-600">
            <Icon name="chat" />
            <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white tabular-nums">
              {newComments.count > 9 ? '9+' : newComments.count}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px]">내 글에 새 댓글이 달렸어요</b>
            <span className="block truncate text-sm text-sub">{newComments.title}</span>
          </span>
          <span className="shrink-0 text-sm font-bold text-brand-600">보기</span>
        </Link>
      )}

      {/* 최근에 일한 공고 후기: 다음 근무자에게 도움 (일한 사람만, 별명) */}
      {nudge && (
        <Link href={`/me/review/${nudge.jobId}`} className="card-link flex animate-pop items-center gap-3 p-4" data-review-nudge>
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-50 text-xl">
            ⭐
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px]">{fmtDate(nudge.workDate)} 일, 어땠나요?</b>
            <span className="block truncate text-sm text-sub">{nudge.title}</span>
          </span>
          <span className="shrink-0 text-sm font-bold text-amber-600">후기 쓰기</span>
        </Link>
      )}

      <section id="today-work" className="scroll-mt-20">
        <h2 className="section-title">오늘의 {pro ? '일' : '근무'}</h2>
        {todayApps.length === 0 ? (
          nextApp ? (
            // 오늘 근무가 없으면 다음 근무를 크게 (며칠 남았는지·시간·장소·길찾기)
            <div className="card space-y-2 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--color-brand-500)_10%,white)_0%,white_60%)] ring-brand-100" data-next-work>
              <p className="flex items-center gap-2 text-sm font-bold text-brand-700">
                <span className="badge bg-brand-600 text-white">{dLabel(firstDay(nextApp))}</span>
                다음 근무
                <Link href={`/jobs/${nextApp.job_id}`} className="ml-auto text-sm font-semibold text-brand-600">
                  공고 보기 →
                </Link>
              </p>
              <Link href={`/jobs/${nextApp.job_id}`} className="block text-lg font-bold">
                {nextApp.job.title}
              </Link>
              <CompanyName job={nextApp.job} />
              <p className="text-sm text-sub">
                {fmtDateRange(nextApp.job.start_date, nextApp.job.end_date)} {scheduleText(nextApp.job)}
                {nextApp.job.location_name && ` · ${nextApp.job.location_name}`}
              </p>
              {nextApp.available_dates && <p className="text-sm font-semibold text-brand-700"><Icon name="calendar" /> 내 근무일 {nextApp.available_dates.map(fmtDate).join(' · ')}</p>}
              {nextApp.job.meeting_point && <p className="text-sm text-sub"><Icon name="flag" className="text-mute" /> 집결 {nextApp.job.meeting_point}</p>}
              {/* 전날 미리 챙기기: 근무 날 오늘 근무 카드와 같은 체크가 이어짐 */}
              {(() => {
                const items = [...new Set(`${nextApp.job.dress_code ?? ''},${nextApp.job.supplies ?? ''}`.split(/[,·、/\n]+/).map((x) => x.trim()).filter((x) => x.length > 0 && x.length <= 20))].slice(0, 8)
                return items.length >= 2 ? <PrepChecklist storageKey={`prep-${nextApp.job_id}-${firstDay(nextApp)}`} items={items} /> : null
              })()}
              <p className="text-xs text-mute">오늘은 예정된 근무가 없어요. 근무 날 이 화면에서 출퇴근을 눌러요.</p>
            </div>
          ) : (
            <Empty icon="🌤️" sticker="schedule" title={pro ? '오늘 예정된 일이 없어요' : '오늘 예정된 근무가 없어요'}>
              {/* 전문가는 알바 공고가 아닌 전문가 의뢰 목록으로 */}
              <Link href={pro ? '/pro' : '/'} className="font-semibold text-brand-600">
                {pro ? '모집 중인 의뢰 보기 →' : '모집 중인 알바 보기 →'}
              </Link>
            </Empty>
          )
        ) : (
          <div className="stagger space-y-3">
            {todayApps.map((a) => {
              const job = a.job
              const todayAtt = atts.find((t) => t.job_id === job.id && t.work_date === today)
              const open = openAtt?.job_id === job.id ? openAtt : null
              const docsLeft = pendingDocs.filter((d) => d.job_id === job.id).length
              const notChosen = a.available_dates && !a.available_dates.includes(today)
              const map = mapLinks({ name: job.location_name, address: job.address, lat: job.lat, lng: job.lng })
              // 지난 근무를 종료하지 않고 그 근무 시간도 끝났으면: 끝난 시각을 따로 받음 (지금 누르면 다음 날 시각이 찍힘)
              const forgot = open && open.work_date < today && Date.now() >= scheduledEnd(shiftOf(job, open), open.work_date).getTime() ? open : null
              return (
                <div key={a.id} className="card relative space-y-4 ring-1 ring-brand-100">
                  <div>
                    <p className="truncate text-xs font-semibold text-mute">
                      {[job.company?.company_name && `🏢 ${job.company.company_name}`, job.event_name].filter(Boolean).join(' · ')}
                    </p>
                    <h3 className="text-lg font-bold">{job.title}</h3>
                    <p className="text-sm text-sub">
                      {(() => {
                        // 오늘 바뀐 시간에 동의했으면 그 시간으로
                        const t = todayShift(job, todayAtt)
                        return hhmm(t.start_time) !== hhmm(job.start_time) || hhmm(t.end_time) !== hhmm(job.end_time) ? (
                          <b className="text-brand-700">
                            {hhmm(t.start_time)} ~ {hhmm(t.end_time)} (변경 동의)
                          </b>
                        ) : (
                          scheduleText(job)
                        )
                      })()}
                      {job.location_name && ` · ${job.location_name}`}
                    </p>
                    {/* 출근 전에 챙길 것: 집결 장소·복장·준비물 */}
                    {(job.meeting_point || job.dress_code || job.supplies) && (
                      <ul className="mt-2 space-y-1 rounded-xl bg-bg px-3 py-2.5 text-sm">
                        {job.meeting_point && (
                          <li>
                            <Icon name="flag" className="text-mute" /> <b className="font-semibold text-sub">집결</b> {job.meeting_point}
                          </li>
                        )}
                        {job.dress_code && (
                          <li>
                            <Icon name="shirt" className="text-mute" /> <b className="font-semibold text-sub">복장</b> {job.dress_code}
                          </li>
                        )}
                        {job.supplies && (
                          <li>
                            <Icon name="bag" className="text-mute" /> <b className="font-semibold text-sub">준비물</b> {job.supplies}
                          </li>
                        )}
                      </ul>
                    )}
                    {/* 준비물·복장 하나씩 체크 (2개 이상일 때) */}
                    {(() => {
                      const items = [...new Set(`${job.dress_code ?? ''},${job.supplies ?? ''}`.split(/[,·、/\n]+/).map((x) => x.trim()).filter((x) => x.length > 0 && x.length <= 20))].slice(0, 8)
                      return items.length >= 2 ? <PrepChecklist storageKey={`prep-${job.id}-${today}`} items={items} /> : null
                    })()}
                    {a.position && (
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-700">
                        <Icon name="pin" /> 내 배치 · {a.position}
                      </p>
                    )}
                    {(() => {
                      const n = latestNotice.get(job.id)
                      if (!n) return null
                      const at = kstDate(n.created_at) === today ? kstTime(n.created_at) : fmtDate(kstDate(n.created_at))
                      return (
                        <Link href="/me/chat" className="mt-2 block rounded-xl bg-amber-50 px-3 py-2.5 text-sm ring-1 ring-amber-200 transition active:scale-[0.98]">
                          <span className="flex items-center justify-between gap-2 text-xs font-bold text-amber-800">
                            {signalOf(n.body) === 'change' ? SIGNAL.change : '📢 담당자 공지'}
                            <span className="font-medium text-amber-700">{at}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap text-ink">{n.body.replace(/^.*\n?/, '')}</span>
                        </Link>
                      )
                    })()}
                    {(job.manager_phone || map) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        {job.manager_phone && (
                          <>
                            <span className="text-sub">현장 담당 {job.manager_name}</span>
                            <ContactButtons phone={job.manager_phone} name={`담당자 ${job.manager_name ?? ''}`.trim()} showNumber={false} />
                          </>
                        )}
                        {map && (
                          <a href={map.route ?? map.kakao} target="_blank" rel="noreferrer" className="contact-btn bg-bg text-sub hover:bg-line">
                            <Icon name="route" /> {map.route ? '길찾기' : '지도'}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <ContractNote job={job} received={a.contract_received_at} />
                  {notChosen && !todayAtt && !open ? (
                    // 오늘은 내 근무일이 아님 (지원할 때 고르지 않았거나 '이날은 못 가요'로 뺀 날): 근무 시작은 접어 둠
                    <div className="space-y-2 rounded-xl bg-bg px-4 py-3">
                      <p className="font-bold">🗓️ 오늘은 내 근무일이 아니에요</p>
                      <p className="text-sm text-sub">
                        {(() => {
                          const next = a.available_dates!.filter((d) => d > today).sort()[0]
                          return next ? `다음 근무일은 ${fmtDate(next)}이에요.` : '이 행사에서 남은 근무일이 없어요.'
                        })()}
                      </p>
                      <details className="text-sm">
                        <summary className="cursor-pointer py-1 font-semibold text-sub">담당자가 오늘 나와 달라고 했나요?</summary>
                        <div className="mt-2">
                          <ClockPanel jobId={job.id} open={null} useLocation={job.lat != null} gpsRequired={job.gps_required} askedAt={arriveSent.get(job.id)} />
                        </div>
                      </details>
                    </div>
                  ) : forgot ? (
                    <ForgotClockOut
                      attendanceId={forgot.id}
                      dateLabel={fmtDate(forgot.work_date)}
                      startText={kstTime(forgot.clock_in)}
                      endText={hhmm(shiftOf(job, forgot).end_time)}
                    />
                  ) : docsLeft > 0 ? (
                    // 두 줄을 고르게 ('…시작할 / 수 있어요.'처럼 끝에 한두 낱말만 남지 않게)
                    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-balance text-amber-800" data-sign-before-start>
                      위의 서류 {docsLeft}건에 서명하면 근무를 시작할 수 있어요.
                    </p>
                  ) : open ? (
                    <ClockPanel
                      jobId={job.id}
                      open={{ id: open.id, clock_in: open.clock_in, startText: kstTime(open.clock_in) }}
                      endAt={scheduledEnd(todayShift(job, open), open.work_date).toISOString()}
                      endText={hhmm(todayShift(job, open).end_time)}
                      useLocation={job.lat != null}
                      gpsRequired={job.gps_required}
                      serverNow={Date.now()}
                    />
                  ) : todayAtt?.clock_out ? (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-bg px-4 py-3 text-center">
                        <p className="font-bold">오늘 근무 완료 👏</p>
                        {/* 담당자가 고친(보정) 시각이 있으면 그것으로 */}
                        <p className="text-sm text-sub">
                          {kstTime(todayAtt.adj_in ?? todayAtt.clock_in)} ~ {kstTime(todayAtt.adj_out ?? todayAtt.clock_out)} (
                          {minutesText(calcDay(job, todayAtt).paidMin)} 인정)
                        </p>
                        {/* 오늘 번 돈 (세금 떼기 전, 연장은 서로 확인한 만큼만) */}
                        {calcDay(job, todayAtt).gross > 0 && (
                          <p className="mt-1 text-lg font-extrabold text-brand-700 tabular-nums">
                            오늘 약 {won(calcDay(job, todayAtt).gross)} <span className="text-xs font-semibold text-mute">세전</span>
                          </p>
                        )}
                      </div>
                      {/* 예정보다 일찍 끝났으면: 근로조건대로 시간 인정 요청 (담당자 승인 → 정산에 그대로) */}
                      {!todayAtt.paid &&
                        (() => {
                          const end = scheduledEnd(todayShift(job, todayAtt), todayAtt.work_date)
                          const out = new Date(todayAtt.adj_out ?? todayAtt.clock_out)
                          const sent = fixSent(job.id)
                          return out.getTime() < end.getTime() - 60_000 || sent?.full ? (
                            <FullTimeRequest attendanceId={todayAtt.id} endText={kstTime(end)} outText={kstTime(out)} sent={sent?.full ? sent.at : null} />
                          ) : null
                        })()}
                      {!todayAtt.paid && (
                        <FixRequest
                          attendanceId={todayAtt.id}
                          inText={kstTime(todayAtt.adj_in ?? todayAtt.clock_in)}
                          outText={kstTime(todayAtt.adj_out ?? todayAtt.clock_out)}
                          sent={fixSent(job.id)?.full ? null : fixSent(job.id)}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* 출근 확인을 요청해 두었으면 '근무 시작을 눌러 주세요' 안내는 빼고 (기다리는 중 안내만) */}
                      {!arriveSent.has(job.id) && <StartCountdown
                        startAt={kstAt(today, todayShift(job).start_time).toISOString()}
                        endAt={scheduledEnd(todayShift(job), today).toISOString()}
                        startText={hhmm(todayShift(job).start_time)}
                        serverNow={Date.now()}
                      />}
                      <ClockPanel jobId={job.id} open={null} useLocation={job.lat != null} gpsRequired={job.gps_required} askedAt={arriveSent.get(job.id)} />
                    </div>
                  )}
                  {/* 출근 전이고 근무가 끝나기 전: 늦으면 담당자에게 알리기 */}
                  {!todayAtt && !open && !notChosen && new Date() < scheduledEnd(todayShift(job), today) && (
                    <LateNotice jobId={job.id} sent={lateSent.get(job.id) ?? null} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
      {todayApps.length > 0 && profileNags}

      {upcoming.length > 0 && (
        <section>
          <h2 className="section-title">예정된 근무</h2>
          <div className="stagger space-y-2">
            {upcoming.map((a) => (
              <div key={a.id} id={`work-${a.id}`} className="card flex scroll-mt-20 items-center gap-3 py-4 target:ring-2 target:ring-brand-300">
                <Link href={`/jobs/${a.job_id}`} className="min-w-0 flex-1">
                  <p className="font-bold">{a.job.title}</p>
                  <CompanyName job={a.job} />
                  <p className="text-sm text-sub">
                    {fmtDateRange(a.job.start_date, a.job.end_date)} {scheduleText(a.job)}
                  </p>
                  {a.available_dates && <p className="mt-0.5 text-xs font-semibold text-brand-700"><Icon name="calendar" /> 내 근무일 {a.available_dates.map(fmtDate).join(' · ')}</p>}
                  {a.position && <p className="mt-0.5 text-sm font-semibold text-brand-700"><Icon name="pin" /> 배치 · {a.position}</p>}
                  <ContractNote job={a.job} received={a.contract_received_at} compact />
                  {/* 확정 뒤 담당자가 시간·장소를 바꿨으면 눈에 띄게 */}
                  {(() => {
                    const n = latestNotice.get(a.job_id)
                    if (!n || signalOf(n.body) !== 'change') return null
                    return (
                      <p className="mt-1.5 inline-block rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                        🔔 {fmtDate(kstDate(n.created_at))}에 일정이 바뀌었어요 · 공고에서 확인
                      </p>
                    )
                  })()}
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`badge ${APP_STATUS.approved.cls}`}>확정</span>
                  {/* 휴대폰 달력에 넣기 (.ics) */}
                  <a href={`/me/calendar/${a.id}`} className="chip h-8 px-3 text-xs">
                    <Icon name="calendar" /> 달력에 넣기
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section>
          <h2 className="section-title">확정 대기</h2>
          <div className="stagger space-y-2">
            {waiting.map((a) => (
              <Link key={a.id} href={`/jobs/${a.job_id}`} className="card-link flex items-center justify-between py-4">
                <div className="min-w-0">
                  <p className="font-bold">{a.job.title}</p>
                  <CompanyName job={a.job} />
                  <p className="text-sm text-sub">{fmtDateRange(a.job.start_date, a.job.end_date)}</p>
                  {/* 모집이 마감됐으면 결과를 기다리는 중이라고 (계속 지원 중인 줄 알지 않게) */}
                  {a.job.status === 'closed' && <p className="text-xs font-semibold text-amber-700">모집 마감 · 결과를 곧 알려 드려요</p>}
                </div>
                <span className={`badge shrink-0 ${APP_STATUS.applied.cls}`}>지원완료</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold">근무 내역 · 급여</h2>
            <Link href="/me/history" className="text-sm font-semibold text-brand-600">
              지난 근무 전체 →
            </Link>
          </div>
          <div className="stagger space-y-2">
            {history.slice(0, 3).map(({ job, s, live, paid }) => (
              <div key={job.id} className="card space-y-3" data-history-job={job.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{job.title}</p>
                    <CompanyName job={job} />
                    <p className="text-sm text-sub">
                      {/* 첫날 근무 중이면 '0일 · 0분' 없이 '오늘 근무 중'만 */}
                      {!(live > 0 && s.days === 0) && `${s.days}일 · ${minutesText(s.paidMin)}`}
                      {live > 0 && (
                        <span className="font-semibold text-emerald-600" data-live-shift>
                          {s.days > 0 ? ' · ' : ''}오늘 근무 중
                        </span>
                      )}
                      {s.incomplete - live > 0 && <span className="text-amber-600"> · 종료 기록 없음 {s.incomplete - live}일</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {live > 0 && s.days === 0 ? (
                      // 첫날 근무 중: 0원 대신 (퇴근하면 계산됨)
                      <>
                        <p className="text-base font-extrabold whitespace-nowrap text-emerald-600">근무 중</p>
                        <p className="text-xs whitespace-nowrap text-mute">끝나면 계산돼요</p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-extrabold whitespace-nowrap">{won(s.net)}</p>
                        <p className="text-xs whitespace-nowrap text-mute">{paid ? '지급완료' : '실수령 예상'}</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* 첫 근무가 아직 진행 중이면 명세서·확인서는 끝난 뒤에 (0원 명세서 막기) */}
                  {!(live > 0 && s.days === 0) && (
                    <>
                      <Link href={`/print/payslip/${job.id}/${user.id}`} className="btn-soft btn-sm">
                        {job.tax_type === 'business' || job.tax_type === 'other' ? '지급명세서' : '임금명세서'}
                      </Link>
                      <Link href={`/print/cert/${job.id}/${user.id}`} className="btn-gray btn-sm">
                        근무확인서
                      </Link>
                    </>
                  )}
                  {docOpen(job.id)
                    ? docs
                        .filter((d) => d.job_id === job.id && d.status === 'signed')
                        .map((d) => (
                          <Link key={d.id} href={`/docs/${d.id}`} className="btn-gray btn-sm">
                            {d.title}
                          </Link>
                        ))
                    : docs.some((d) => d.job_id === job.id && d.status === 'signed') && (
                        <Link href={docInquiryHref(job.id)} className="btn-gray btn-sm text-mute">
                          🔒 서류는 관리자 문의
                        </Link>
                      )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {docs.some((d) => d.status === 'signed') && (
        <section>
          <h2 className="section-title">서명한 서류</h2>
          {/* 행사마다 쌓이므로 최근 4건만 펼쳐 두고 나머지는 더 보기 */}
          <ShowMore
            limit={4}
            className="card divide-y divide-line py-1"
            restClassName="divide-y divide-line border-t border-line"
            items={docs
              .filter((d) => d.status === 'signed')
              .map((d) => (
                <Link key={d.id} href={docOpen(d.job_id) ? `/docs/${d.id}` : docInquiryHref(d.job_id)} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <b className={`block ${docOpen(d.job_id) ? '' : 'text-mute'}`}>{d.title}</b>
                    <span className="block truncate text-xs text-mute">{docJobLine(d.job_id)}</span>
                  </span>
                  {docOpen(d.job_id) ? (
                    <span className="shrink-0 whitespace-nowrap text-mute">보기 →</span>
                  ) : (
                    <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-mute">🔒 관리자 문의</span>
                  )}
                </Link>
              ))}
          />
        </section>
      )}
    </div>
  )
}
