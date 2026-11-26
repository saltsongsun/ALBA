import type { Metadata } from 'next'
import { breakWindow, siteConditions } from '@/lib/conditions'
import { canWrite, myReviewedJobs, newCommentsOnMine, reviewNudge } from '@/lib/community'
import LevelCard from '@/components/LevelCard'
import { computeXp, shiftFacts } from '@/lib/xp'
import { cookies } from 'next/headers'
import Link from 'next/link'
import LiveNumber from '@/components/LiveNumber'
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
import CalendarLink from '@/components/CalendarLink'
import HashFlash from '@/components/HashFlash'
import { won } from '@/lib/format'
import { answerOvertime, answerShift, confirmComing } from '@/app/actions/worker'
import { AckButton, AckMark, ChangeRows, type Notice } from '@/components/NoticeAck'
import { calcDay, workingToday, OT_ASK_MIN, scheduledEnd, settle, shiftOf, roundCut } from '@/lib/pay'
import { pushPublicKey } from '@/lib/push'
import { requireUser } from '@/lib/session'
import { isComing, isFullTimeAsk, parseFix, parseLate, pendingFix, SIGNAL, signalOf, WAIT_HEAD } from '@/lib/signals'
import WaitNoteLine from '@/components/WaitNoteLine'
import PaydayLine from '@/components/PaydayLine'
import { workerPaydays } from '@/lib/worker-payday'
import ApplySteps from '@/components/ApplySteps'
import { dateList, fmtDate, fmtDateRange, hhmm, kstAt, kstDate, kstTime, minutesText } from '@/lib/time'
import type { Application, Attendance, Job, ShiftChange, SignedDoc } from '@/lib/types'
import { canOpenJobDocs, docInquiryHref } from '@/lib/doc-access'
import { contractNameOf } from '@/lib/members'
import { docsAutoAt, docsDue } from '@/lib/data'
import { accountAskers, askersText } from '@/lib/accountAsk'
import { VIEW_COOKIE } from '@/lib/view'

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
  // 앱 아이콘으로 열었을 때(?app=1) 관리자는 관리자 화면부터 (첫 화면 '/'와 같게 · '근무자 화면으로 보기' 중이면 그대로)
  if (sp.app === '1' && user.role === 'admin' && (await cookies()).get(VIEW_COOKIE)?.value !== 'worker') redirect('/admin')
  // 외주 업체는 근무(출퇴근)가 없으므로 전문가 화면으로
  if (user.memberType === 'vendor' && user.role !== 'admin') redirect('/pro')
  // 전문가: '근무' 대신 '일', 빈 화면에서 전문가 의뢰 목록으로
  const pro = user.memberType === 'expert' && user.role !== 'admin'
  const today = kstDate()

  // 최근에 일한 공고 후기 안내 (다른 것과 함께 읽음)
  const nudgeP = canWrite(user) && !pro ? reviewNudge(user.id) : Promise.resolve(null)
  // 근무 내역 카드의 정산일 (담당자가 알린 날 · 없으면 공고 지급일 · '지난 근무'와 같은 계산) — 다른 것과 함께 읽음
  const paydaysP = workerPaydays(user.id).catch(() => null)
  // 계좌 등록을 요청한 회사 (계좌 안내 줄에 '○○에서 기다려요' · 못 읽으면 기본 문구 — 정기 개선 2026-11-26 07:35)
  const askersP = accountAskers(user.id).catch(() => [])
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
      .select('id, job_id, body, created_at, read_at')
      .eq('thread_user_id', user.id)
      .eq('from_admin', true)
      .not('job_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30)
      .then((r) => (must(r) as Notice[]).sort((a, b) => b.created_at.localeCompare(a.created_at))),
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
  // 근무 내역 정산(주휴 포함)은 출퇴근 기록만 있으면 되니 지금 바로 출발 (아래 다른 조회를 기다린 뒤 따로 기다리지 않게 · 속도 개선 2026-11-22)
  const attsPayP = withWeeklyPay(atts)
  attsPayP.catch(() => {})
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
  // 오늘 '시간 인정 요청'에 담당자가 답했으면 (인정 / 실제대로): 요청 칸 대신 결과를 그 자리에 (다시 요청하지 않게)
  const fullAnswer = (jobId: string) => {
    const m = adminJobMsgs
      .filter((x) => x.job_id === jobId && kstDate(x.created_at) === today && ['fixDone', 'fixNo'].includes(signalOf(x.body) ?? '') && x.body.includes('근로조건대로'))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!m) return null
    return signalOf(m.body) === 'fixDone' ? { ok: true as const, time: m.body.match(/(\d{1,2}:\d{2})까지 인정/)?.[1] ?? null } : { ok: false as const, time: null }
  }
  const pendingShifts = shifts.filter((c) => c.status === 'pending')
  // 오늘 적용되는 시간 (동의한 변경이 있으면 그것)
  const todayShift = (job: Job, att?: Attendance | null) => {
    if (att?.sched_start && att.sched_end) return shiftOf(job, att)
    const c = shifts.find((x) => x.job_id === job.id && x.status === 'agreed' && x.work_date === today)
    return c ? { start_time: c.start_time, end_time: c.end_time } : shiftOf(job)
  }
  // '일찍 누른 출근은 시작 시각부터 인정' 공고에 시작 시각 전에 근무를 시작했으면: 급여를 세기 시작하는 시각 (담당자가 시작을 고쳤으면 그 시각대로라 안내 안 함)
  const paidFromOf = (job: Job, att: Attendance) => {
    if (!job.early_clamp || att.adj_in) return undefined
    const start = todayShift(job, att).start_time
    return Date.parse(att.clock_in) < kstAt(att.work_date, start).getTime() ? hhmm(start) : undefined
  }
  const lateSent = new Map<string, { minutes: number; eta: string; at: string }>()
  for (const m of mySignals) {
    const l = signalOf(m.body) === 'late' ? parseLate(m.body) : null
    if (l && !lateSent.has(m.job_id)) lateSent.set(m.job_id, { ...l, at: kstTime(m.created_at) })
  }
  // 오늘 보낸 출근 확인 요청 (위치 확인이 안 될 때): 공고별 마지막 요청 시각 — 출근 기록이 생기면 화면에서 사라짐
  const arriveSent = new Map<string, string>()
  for (const m of mySignals) if (signalOf(m.body) === 'arrive' && !arriveSent.has(m.job_id)) arriveSent.set(m.job_id, kstTime(m.created_at))
  // 내일 근무에 '내일 갈게요'를 이미 눌렀는지 (공고별 누른 시각) — 오늘 보낸 것만 보면 됨 (전날에만 누를 수 있음)
  const tomorrow = kstDate(new Date(Date.parse(`${today}T12:00:00+09:00`) + 86_400_000))
  const comingSent = new Map<string, string>()
  for (const m of mySignals) if (isComing(m.body, tomorrow) && !comingSent.has(m.job_id)) comingSent.set(m.job_id, kstTime(m.created_at))
  const latestNotice = new Map<string, Notice>()
  for (const n of notices) if (!latestNotice.has(n.job_id)) latestNotice.set(n.job_id, n)
  // 결과가 늦어 회사에서 받은 정중한 기다림 안내 (공고별 가장 최근 것) — 확정 대기 칸에 '🙏 기다림 안내를 받았어요'
  const waitNoted = new Map<string, Notice>()
  for (const n of adminJobMsgs) if (n.body.startsWith(WAIT_HEAD) && !waitNoted.has(n.job_id)) waitNoted.set(n.job_id, n)
  // 다음 근무 카드엔 '📢 공지'만 (일정 변경은 아래 🔔 줄이 따로 알림) — 전날 보낸 '내일 집결은…'을 홈에서 바로
  const latestAnnounce = new Map<string, Notice>()
  for (const n of notices) if (n.body.startsWith('📢 공지') && !latestAnnounce.has(n.job_id)) latestAnnounce.set(n.job_id, n)
  // 공지 칸: 누르면 그 회사 문의함으로 바로 (여러 회사에서 일하면 대화 목록부터 나와 한 번 더 골라야 하던 것) · 안 읽었으면 '새'
  const noticeBox = (n: Notice, companyId: string, label: string, clamp: string) => {
    const at = kstDate(n.created_at) === today ? kstTime(n.created_at) : `${fmtDate(kstDate(n.created_at))} ${kstTime(n.created_at)}`
    return (
      <div className="mt-2 rounded-xl bg-amber-50 text-sm ring-1 ring-amber-200" data-job-notice={n.read_at ? 'read' : 'new'}>
        <Link href={`/me/chat?co=${companyId}`} className="block rounded-xl px-3 py-2.5 transition active:scale-[0.98]">
          <span className="flex items-center justify-between gap-2 text-xs font-bold text-amber-800">
            <span className="flex min-w-0 items-center gap-1.5">
              {label}
              <AckMark n={n} />
            </span>
            <span className="shrink-0 font-medium whitespace-nowrap text-amber-700">{at}</span>
          </span>
          <span className={`mt-0.5 ${clamp} block whitespace-pre-wrap text-ink`}>{n.body.replace(/^.*\n?/, '')}</span>
        </Link>
        <AckButton n={n} />
      </div>
    )
  }
  const photoAt = me?.photo_at ?? null
  const hasAccount = !!me?.bank_account_enc


  const openAtt = atts.find((a) => !a.clock_out) ?? null
  const approved = apps.filter((a) => a.status === 'approved')
  const todayApps = approved.filter(
    (a) => (a.job.start_date <= today && a.job.end_date >= today) || openAtt?.job_id === a.job_id,
  )
  // 출근 기록 없이 오늘 근무 시간이 다 지남 (도착 알림도 안 보냄) — 오늘 근무 카드에서 '시간이 지났어요'로 · 맨 아래로
  const overNoRecord = (a: AppWithJob) =>
    openAtt?.job_id !== a.job_id &&
    !atts.some((t) => t.job_id === a.job_id && t.work_date === today) &&
    !arriveSent.has(a.job_id) &&
    !(a.available_dates && !a.available_dates.includes(today)) &&
    Date.now() >= scheduledEnd(todayShift(a.job), today).getTime()
  const todayRank = (a: AppWithJob) =>
    openAtt?.job_id === a.job_id ? 0 : overNoRecord(a) ? 3 : atts.some((t) => t.job_id === a.job_id && t.work_date === today && t.clock_out) ? 2 : 1
  // 여러 날 행사는 사람마다 근무일이 다름 (고른 날 중 오늘 이후 첫날)
  const firstDay = (a: AppWithJob) => (a.available_dates ?? [a.job.start_date]).filter((d) => d >= today).sort()[0] ?? a.job.start_date
  const upcoming = approved.filter((a) => a.job.start_date > today).sort((a, b) => firstDay(a).localeCompare(firstDay(b)))
  const nextApp = upcoming[0] ?? null
  // 오늘 근무가 없는 날은 다음 근무를 '오늘의 근무' 자리에 크게 보여 주므로, 아래 '예정된 근무' 목록에서는 그 근무를 뺌 (같은 근무를 두 번 보이지 않게)
  const heroNext = todayApps.length === 0 ? nextApp : null
  const restUpcoming = heroNext ? upcoming.filter((x) => x.id !== heroNext.id) : upcoming
  // 다음 근무 장소로 가는 길 (전날 미리 확인 · 장소 정보가 없으면 없음)
  const nextMap = heroNext ? mapLinks({ name: heroNext.job.location_name, address: heroNext.job.address, lat: heroNext.job.lat, lng: heroNext.job.lng }) : null
  // 확정했지만 서명 서류가 아직 안 온 예정 근무: 모집이 끝나면(마감·근무 전날 저녁) 보내 줌 → 카드에 한 줄
  // (근로계약서는 모집 마감 후 · 사용자 요청 2026-11-24 — 서류가 왜 없는지 궁금하지 않게 · 정기 개선 20:36)
  // 앱으로 서명할 서식이 있을 때만 (종이·다른 서비스로 받는 근로계약서만 있으면 앱 서류가 오지 않음 — 서류 만드는 규칙과 같게)
  const hasDocJob = new Set(docs.map((d) => d.job_id))
  const laterCand = upcoming.filter((a) => !hasDocJob.has(a.job_id) && (a.job.required_docs?.length ?? 0) > 0 && !docsDue(a.job))
  const laterTpl = laterCand.length
    ? (((await db().from('doc_templates').select('id, kind').in('id', [...new Set(laterCand.flatMap((a) => a.job.required_docs))].slice(0, 200))).data ?? []) as { id: string; kind: string }[])
    : []
  const tplKind = new Map(laterTpl.map((t) => [t.id, t.kind]))
  const docsLaterJobs = new Set(
    laterCand
      .filter((a) => a.job.required_docs.some((id) => tplKind.has(id) && ((a.job.contract_method ?? 'app') === 'app' || tplKind.get(id) !== 'contract')))
      .map((a) => a.job_id),
  )
  // 예정 근무에 덧붙는 줄: 배치 · 계약서 안내 · 서류는 모집이 끝나면 · 일정이 바뀐 알림 (큰 카드와 목록 카드가 같이 씀)
  const upcomingExtras = (a: AppWithJob) => (
    <>
      {a.position && <p className="mt-0.5 text-sm font-semibold text-brand-700"><Icon name="pin" /> 배치 · {a.position}</p>}
      <ContractNote job={a.job} received={a.contract_received_at} compact />
      {docsLaterJobs.has(a.job_id) && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-sub" data-docs-later>
          <Icon name="file" className="shrink-0 text-mute" />
          {/* 늦어도 언제 오는지 (근무 전날 저녁 · 마감하면 더 일찍) — 정기 개선 2026-11-25 04:36 */}
          <span className="min-w-0 truncate">{docsAutoAt(a.job, Date.now(), false, true) ? `서명할 서류는 늦어도 ${docsAutoAt(a.job, Date.now(), false, true)}에 와요` : '서명할 서류는 모집이 끝나면 와요'}</span>
        </p>
      )}
    </>
  )
  // 확정 뒤 담당자가 시간·장소를 바꿨으면 눈에 띄게 — 무엇이 어떻게 바뀌었는지 바로 (공고까지 안 들어가도) · 안 읽었으면 '새'
  // (카드 전체 너비 — 목록 카드의 좁은 왼쪽 칸에 넣으면 두 줄로 꺾이고 새 값이 잘림)
  const changeNote = (a: AppWithJob) => {
    const n = latestNotice.get(a.job_id)
    if (!n || signalOf(n.body) !== 'change') return null
    return (
      <div className="mt-2 rounded-xl bg-amber-50 text-sm ring-1 ring-amber-200" data-change-note={n.read_at ? 'read' : 'new'}>
        <Link href={`/me/chat?co=${a.job.company_id}`} className="block rounded-xl px-3 py-2.5 transition active:scale-[0.98]">
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
            🔔 {fmtDate(kstDate(n.created_at))}에 일정이 바뀌었어요
            <AckMark n={n} />
          </span>
          <ChangeRows body={n.body} />
        </Link>
        <AckButton n={n} />
      </div>
    )
  }
  // 근무 전날: '내일 갈게요' 한 번 → 담당자 화면에 출근 확인으로 모임 (전날 밤 전화 돌리는 일을 줄임)
  const comingRow = (a: AppWithJob) =>
    firstDay(a) === tomorrow && a.job.status !== 'cancelled' &&
    (comingSent.has(a.job_id) ? (
      <p id={a.id === comingFirst ? 'coming' : undefined} className="mt-3 flex scroll-mt-24 items-center justify-between gap-2 border-t border-line pt-2 text-sm" data-coming="done">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold whitespace-nowrap text-emerald-700">
          <span aria-hidden className="grid size-5 shrink-0 animate-pop place-items-center rounded-full bg-emerald-600 text-[11px] leading-none font-bold text-white">
            ✓
          </span>
          내일 출근 확인함 · {comingSent.get(a.job_id)}
        </span>
        {/* 확인한 뒤에 사정이 생겼을 때: 공고의 '근무를 못 하게 됐어요'로 (전화 먼저 안내가 거기 있음) */}
        <Link href={`/jobs/${a.job_id}?cant=1#cant`} className="-mr-1 inline-flex min-h-10 shrink-0 items-center px-1 text-xs font-semibold whitespace-nowrap text-sub active:opacity-60" data-coming-cant>
          못 가게 됐어요
        </Link>
      </p>
    ) : (
      <form id={a.id === comingFirst ? 'coming' : undefined} action={confirmComing.bind(null, a.id)} className="mt-3 flex scroll-mt-24 items-center gap-2 border-t border-line pt-3" data-coming="ask">
        <span className="min-w-0 flex-1 text-sm text-sub">
          <b className="font-semibold text-ink">내일</b> 올 수 있나요?
        </span>
        {/* 못 오면 전날에 바로 알리게: 공고의 '근무를 못 하게 됐어요' 칸을 열어 둠 (담당자가 대신할 사람을 구할 시간) */}
        <Link href={`/jobs/${a.job_id}?cant=1#cant`} className="btn-gray btn-sm min-h-10 shrink-0 px-3 whitespace-nowrap" data-coming-cant>
          못 가요
        </Link>
        <SubmitButton className="btn-primary btn-sm min-h-10 shrink-0 px-4 whitespace-nowrap" pendingText="알리는 중…" track="내일 갈게요">
          내일 갈게요
        </SubmitButton>
      </form>
    ))
  // 문의함 안내의 '출근 확인하기' 버튼이 데려올 곳 (내일 근무가 여러 개면 첫 카드)
  const comingFirst = upcoming.find((x) => firstDay(x) === tomorrow && x.job.status !== 'cancelled')?.id ?? null
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
  // 서명한 서류 중 서명한 뒤에 그 공고의 '🔔 일정 변경'을 받은 것: '일정 바뀜' (내 문의함 알림만 · 정기 개선 2026-11-22 08:35)
  const signedJobIds = [...new Set(docs.filter((d) => d.status === 'signed' && d.signed_at).map((d) => d.job_id))]
  const lastChange = new Map<string, string>()
  if (signedJobIds.length) {
    const { data: ch } = await db()
      .from('messages')
      .select('created_at, body, job_id, thread_user_id')
      .eq('thread_user_id', user.id)
      .eq('from_admin', true)
      .in('job_id', signedJobIds.slice(0, 100))
      .order('created_at', { ascending: false })
      .limit(500)
    for (const m of (ch ?? []) as { created_at: string; body: string; job_id: string | null; thread_user_id: string }[]) {
      if (m.thread_user_id !== user.id || !m.job_id || signalOf(m.body) !== 'change') continue
      if (m.created_at > (lastChange.get(m.job_id) ?? '')) lastChange.set(m.job_id, m.created_at)
    }
  }
  const docChanged = (d: { job_id: string; signed_at: string | null }) => !!d.signed_at && (lastChange.get(d.job_id) ?? '') > d.signed_at
  // 오늘 근무인데 현장 담당 번호가 없는 공고: 그 회사의 문의 연락처로 (근무 날 연락할 곳이 없지 않게 · 회사 설정의 문의 담당자)
  const noMgr = [...new Set(todayApps.filter((a) => !a.job.manager_phone).map((a) => a.job.company_id))]
  const coContact = new Map<string, { name: string | null; phone: string }>(
    noMgr.length
      ? (
          ((await db()
            .from('companies')
            .select('id, contact_name, contact_phone, company_phone')
            .in('id', noMgr)
            .then(
              (r) => r.data,
              () => null,
            )) ?? []) as { id: string; contact_name: string | null; contact_phone: string | null; company_phone: string | null }[]
        )
          .filter((c) => c.contact_phone || c.company_phone)
          .map((c) => [c.id, { name: c.contact_name, phone: (c.contact_phone || c.company_phone)! }])
      : [],
  )
  // 오늘의 근무 카드가 그 공고의 '서명 ›' 줄을 보여 주는 경우 (오늘이 내 근무일이고 지난 근무 종료를 따로 받는 중이 아니면)
  // → 위 '서명할 서류' 카드에서는 그 서류를 뺌 (같은 안내를 한 화면에 두 번 보이지 않게 · 다른 공고 서류만 남음)
  const signInToday = new Set(
    todayApps
      .filter((a) => {
        const open = openAtt?.job_id === a.job_id ? openAtt : null
        const worked = atts.some((t) => t.job_id === a.job_id && t.work_date === today)
        const notChosen = a.available_dates && !a.available_dates.includes(today)
        const forgot = open && open.work_date < today && Date.now() >= scheduledEnd(shiftOf(a.job, open), open.work_date).getTime()
        return !(notChosen && !worked && !open) && !forgot
      })
      .map((a) => a.job_id),
  )
  // 서명할 서류마다 그 근무가 언제인지: 이미 시작·끝났으면 빨갛게 위로 (근로계약서는 일하기 전에 받는 것) · 아니면 'M/D 근무 전' (정기 개선 2026-11-23 18:36)
  const appOfJob = new Map(apps.map((a) => [a.job_id, a]))
  const docWhen = (jobId: string): { late: boolean; text: string; day: string } => {
    const a = appOfJob.get(jobId)
    if (!a?.job) return { late: false, text: '', day: '9999-12-31' }
    const days = a.available_dates?.length ? [...a.available_dates].sort() : null
    const first = days ? days[0] : a.job.start_date
    const last = days ? days[days.length - 1] : a.job.end_date
    if (last < today) return { late: true, text: '근무 끝남', day: first }
    if (first <= today) return { late: true, text: '근무 시작됨', day: first }
    return { late: false, text: `${fmtDate(first)} 근무 전`, day: first }
  }
  const topDocs = pendingDocs
    .filter((d) => !signInToday.has(d.job_id))
    .sort((x, y) => {
      const a = docWhen(x.job_id), b = docWhen(y.job_id)
      return Number(b.late) - Number(a.late) || a.day.localeCompare(b.day)
    })
  // 위 카드가 없으면 바로 가기(/me#sign-docs)는 오늘의 근무 카드의 첫 '서명 ›' 줄로
  const signAnchorJob = topDocs.length === 0 ? pendingDocs.find((d) => signInToday.has(d.job_id))?.job_id : undefined
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
  const [attsPay, pd] = await Promise.all([attsPayP, paydaysP])
  const history = [...new Set(atts.map((a) => a.job_id))]
    .map((jobId) => {
      const job = jobsById.get(jobId)
      if (!job) return null
      const rows = attsPay.filter((a) => a.job_id === jobId)
      const s = settle(job, rows.map((r) => calcDay(job, r)))
      // 오늘 아직 근무 중이면 '종료 기록 없음'이 아니라 '오늘 근무 중' (퇴근하면 그날이 계산됨)
      const live = workingToday(rows, today)
      // 근무 시간이 끝났는데 종료를 안 누름 → '끝나면 계산돼요' 대신 '종료를 눌러야 계산돼요' (오늘 근무 카드의 안내와 같은 말)
      const liveOver = rows.some((r) => !!r.clock_in && !r.clock_out && r.work_date === today && Date.now() >= scheduledEnd(todayShift(job, r), r.work_date).getTime())
      return { job, rows, s, live, liveOver, paid: rows.every((r) => r.paid) }
    })
    .filter((x) => x !== null)

  // 계좌·사진 등록 안내 (근무 날에는 오늘의 근무 아래에) — 둘 다면 한 카드에 두 줄로 (위아래로 덜 길게)
  // 계좌를 요청한 회사가 있으면 누가 기다리는지 (확정 전이어도 보임 · 작은 깜빡임 점)
  const askers = hasAccount ? [] : await askersP
  const nags = [
    // 근무가 잡혔거나 일한 적이 있는데 계좌가 없으면 (급여를 못 받음)
    !hasAccount && (approved.length > 0 || atts.length > 0 || askers.length > 0)
      ? {
          key: 'account',
          href: '/me/profile#bank_account',
          icon: 'card' as const,
          tone: 'bg-rose-50 text-rose-600',
          title: '급여 계좌를 등록해 주세요',
          sub: askers.length ? `${askersText(askers)}에서 기다려요` : '급여를 받으려면 꼭 필요해요',
          go: '등록',
          ping: askers.length > 0,
        }
      : null,
    !photoAt ? { key: 'photo', href: '/me/profile#photo', icon: 'camera' as const, tone: 'bg-brand-50 text-brand-600', title: '얼굴 사진을 올려 주세요', sub: '현장 담당자가 알아보기 쉬워요', go: '올리기', ping: false } : null,
  ].filter((n) => n !== null)
  const profileNags = nags.length ? (
    <div className="card divide-y divide-line overflow-hidden p-0" data-profile-nags>
      {nags.map((n) => (
        <Link key={n.key} href={n.href} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-bg" data-nag={n.key}>
          <span aria-hidden className={`relative grid size-9 shrink-0 place-items-center rounded-xl text-lg ${n.tone}`}>
            <Icon name={n.icon} />
            {/* 회사가 계좌를 기다리는 중: 모서리에 작은 점 (움직임 줄이기면 깜빡이지 않음) */}
            {n.ping && (
              <span className="absolute -top-0.5 -right-0.5 flex size-2.5" data-nag-ping>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{n.title}</span>
            <span className={`block truncate text-[13px] ${n.ping ? 'font-semibold text-amber-700' : 'text-sub'}`} data-nag-sub>
              {n.sub}
            </span>
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
  // 확정 대기 (지원하고 결과를 기다리는 공고). 오늘·다음 근무가 없으면 이 칸이 가장 궁금한 것이라 '오늘의 근무' 위로 올림
  // 곧 시작(하루 안)인데 아직 확정 전이면: 그 줄에서 바로 담당자에게 문의 (확정된 줄 알고 가거나, 안 된 줄 알고 안 가는 일을 막음)
  // 마지막 날 근무 시간까지 끝났는데 확정되지 않은 지원 (오늘 끝난 행사 · 밤을 넘기는 근무는 끝 시각이 다음 날):
  // '지원완료'로 계속 기다리지 않게 '행사가 끝나 확정되지 않았어요' · 맨 위로 올리지 않고 아래로
  const endMsOf = (a: AppWithJob) => kstAt(a.job.end_date, a.job.end_time).getTime() + (a.job.end_time <= a.job.start_time ? 86_400_000 : 0)
  const lapsedApp = (a: AppWithJob) => a.job.status !== 'cancelled' && Date.now() >= endMsOf(a)
  const waitingLive = waiting.filter((a) => !lapsedApp(a))
  const waitingRows = [...waitingLive, ...waiting.filter(lapsedApp)]
  const waitingFirst = todayApps.length === 0 && !nextApp && waitingLive.length > 0
  // 오늘 하는 근무에 지원하고 확정을 기다리는 중: '오늘 예정된 근무가 없어요'라고 하면 안 가도 되는 줄 알 수 있어서 그대로 말함
  const waitToday = waitingLive.some((a) => workDays(a).includes(today))
  // 오늘 확정을 기다리는 근무의 시작 시각 (가장 이른 것) — 위 확정 대기 칸이 이미 '아직 확정 전'이라고 하니 아래 줄은 시각만 (같은 말 두 번 하지 않게)
  const waitTodayApp = waitingLive
    .filter((a) => workDays(a).includes(today))
    .sort((x, y) => x.job.start_time.localeCompare(y.job.start_time))[0]
  const waitTodayStart = waitTodayApp?.job.start_time.slice(0, 5)
  // 그 근무가 이미 시작했으면 '시작했어요' (위 칸의 '시작했는데 아직 확정 전이에요'와 같은 때) — 정기 개선 2026-11-21 15:35
  const waitTodayStarted = !!waitTodayApp && Date.now() >= kstAt(today, waitTodayApp.job.start_time).getTime()
  // 이번 주 칸: 확정이 없는 날에 지원하고 기다리는 근무가 있으면 점선 (같은 날 또 지원하기 전에 한눈에 · 누르면 그 대기 카드로)
  const weekWait = week.map((d, i) => (weekWork[i].length ? [] : waitingLive.filter((a) => workDays(a).includes(d))))
  const weekWaitCount = weekWait.filter((w) => w.length > 0).length
  const soonMs = Date.now() + 24 * 3600_000
  const waitingSection = waiting.length > 0 && (
    <section data-waiting={waitingFirst ? 'first' : 'below'}>
      <h2 className="section-title">{waitingLive.length ? '확정 대기' : '지원 결과'}</h2>
      <div className="stagger space-y-2">
        {waitingRows.map((a, i) => {
          const day = (a.available_dates ?? []).filter((d) => d >= today).sort()[0] ?? (a.job.start_date >= today ? a.job.start_date : today)
          const startMs = kstAt(day, a.job.start_time).getTime()
          // 마지막 날 근무 시간까지 끝났으면 물어볼 것이 없음
          const lapsed = lapsedApp(a)
          const soon = a.job.status !== 'cancelled' && startMs <= soonMs && !lapsed
          const started = startMs <= Date.now()
          return (
            <div
              key={a.id}
              id={`wait-${a.id}`}
              className="card-link scroll-mt-20 py-4 target:ring-2 target:ring-brand-300"
              data-waiting-app={a.job_id}
              data-waiting-lapsed={lapsed ? '' : undefined}
            >
              {/* 맨 위로 올라온 첫 지원: 지금 어디까지 왔고 다음에 무엇을 하는지 (지원 ✓ → 확정 → 서명 → 출근) */}
              {waitingFirst && i === 0 && !lapsed && (
                <div className="mb-3">
                  <ApplySteps step={2} />
                </div>
              )}
              <Link href={`/jobs/${a.job_id}`} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{a.job.title}</p>
                  <CompanyName job={a.job} />
                  <p className="text-sm text-sub">{fmtDateRange(a.job.start_date, a.job.end_date)}</p>
                  {/* 모집이 마감됐으면 결과를 기다리는 중이라고 (계속 지원 중인 줄 알지 않게) · 행사가 끝났으면 결과를 바로 */}
                  {lapsed ? (
                    <p className="text-xs font-semibold text-sub">행사가 끝나 이번에는 확정되지 않았어요</p>
                  ) : (
                    a.job.status === 'closed' && <p className="text-xs font-semibold text-amber-700">모집 마감 · 결과를 곧 알려 드려요</p>
                  )}
                </div>
                {lapsed ? (
                  <span className="badge shrink-0 bg-bg text-mute">미확정</span>
                ) : waitingFirst && i === 0 ? null : (
                  // 위에 진행 단계(지원 ✓ → 확정 …)가 보이는 첫 카드는 배지를 빼서 같은 말을 두 번 보이지 않게 (정기 개선 2026-11-22 08:35)
                  <span className={`badge shrink-0 ${APP_STATUS.applied.cls}`}>지원완료</span>
                )}
              </Link>
              {soon && (
                // 줄 전체가 누르는 곳 (글자만 누르게 하면 작아서 빗나감)
                <Link
                  href={`/me/chat?job=${a.job_id}&ask=confirm`}
                  className="mt-2.5 flex min-h-10 items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] transition active:scale-[0.98]"
                  data-waiting-soon={started ? 'started' : 'soon'}
                >
                  <span className="min-w-0 font-semibold text-amber-900">{started ? '시작했는데 아직 확정 전이에요' : '곧 시작인데 아직 확정 전이에요'}</span>
                  <span className="shrink-0 font-bold whitespace-nowrap text-brand-700">담당자에게 문의 →</span>
                </Link>
              )}
              {/* 회사에서 이미 '조금만 기다려 주세요' 안내를 보냈으면 (곧 시작이라 물어볼 줄이 있으면 그 줄만) */}
              {!soon && !lapsed && a.job.status !== 'cancelled' && waitNoted.has(a.job_id) && (
                <WaitNoteLine companyId={a.job.company_id} unread={!waitNoted.get(a.job_id)!.read_at} />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )

  // 레벨 카드 · 이번 주 내 근무 · 새 댓글 · 후기 권유: 근무가 없는 날엔 위쪽, 근무 날엔 '오늘의 근무' 아래 (출퇴근 버튼을 밀어내지 않게)
  const extras = (
    <>
      {/* 병아리 레벨 카드는 지금 할 일(시간 변경 답·연장 확인·서명·계좌·사진) 다음에 (재미용이라 할 일을 밀어내지 않게) */}
      {xp && <LevelCard s={xp} />}

      {weekCount + weekWaitCount > 0 && (
        <section aria-label="이번 주 내 근무" data-week>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">이번 주 내 {pro ? '일' : '근무'}</h2>
            <span className="text-sm font-semibold text-brand-700" data-week-count>
              {weekCount > 0 && `${weekCount}일`}
              {weekCount > 0 && weekWaitCount > 0 && ' · '}
              {weekWaitCount > 0 && <span className="text-sub">대기 {weekWaitCount}일</span>}
            </span>
          </div>
          <ol className="grid grid-cols-7 gap-1">
            {week.map((d, i) => {
              const w = weekWork[i]
              const wait = weekWait[i]
              const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
              const label = ['일', '월', '화', '수', '목', '금', '토'][dow]
              const cls = w.length
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 active:scale-95'
                : wait.length
                  ? 'border border-dashed border-brand-400 bg-brand-50/60 text-brand-700 active:scale-95'
                  : `bg-white ring-1 ring-line ${i === 0 ? 'ring-2 ring-brand-300' : ''} ${dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-brand-500' : 'text-sub'}`
              const inner = (
                <>
                  <span className="text-[11px] leading-none font-semibold opacity-80">{i === 0 ? '오늘' : label}</span>
                  <span className="text-base leading-tight font-extrabold tabular-nums">{Number(d.slice(8))}</span>
                  {/* 근무 하나에 점 하나 (같은 날 두 회사 근무면 점 둘 · 3개까지) */}
                  <span aria-hidden className="flex gap-0.5" data-week-dots={w.length}>
                    {Array.from({ length: Math.max(1, Math.min(w.length, 3)) }, (_, k) => (
                      <span key={k} className={`size-1.5 rounded-full ${w.length ? 'bg-white' : wait.length ? 'ring-1 ring-brand-500' : 'bg-transparent'}`} />
                    ))}
                  </span>
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
                  ) : wait.length ? (
                    <a
                      href={`#wait-${wait[0].id}`}
                      aria-label={`${fmtDate(d)} 확정 대기: ${wait.map((x) => x.job.title).join(', ')}`}
                      className={`flex animate-pop flex-col items-center gap-1 rounded-xl py-2 transition ${cls}`}
                      style={{ animationDelay: `${i * 30}ms` }}
                      data-week-wait
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
          {weekWaitCount > 0 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-mute" data-week-legend>
              <span aria-hidden className="inline-block h-3 w-4 rounded border border-dashed border-brand-400 bg-brand-50/60" /> 점선은 확정 대기
            </p>
          )}
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
    </>
  )
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
          {/* 어느 화면인지 (아래 메뉴 이름과 같게) */}
          <p className="text-sm font-semibold text-brand-600" data-page-name>
            {/* 전문가는 아래 메뉴 이름이 '내 일' */}
            {pro ? '내 일' : '내 근무'} · {fmtDate(today)}
          </p>
          <h1 className="text-[26px] leading-tight font-extrabold">{user.name}님, 안녕하세요</h1>
        </div>
        <Link href="/me/profile" className="btn-white btn-sm">
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

      {pendingDocs.length > 0 && <HashFlash id="sign-docs" />}
      {topDocs.length > 0 && (
        // 흰 카드 + 작은 아이콘 (오늘 근무의 서류는 오늘의 근무 카드에 '서명 ›'으로 있어 여기서는 뺌)
        <section id="sign-docs" className="card animate-pop scroll-mt-20" data-sign-card>
          <h2 className="mb-2.5 flex items-center gap-1.5 font-bold">
            <Icon name="pen" className="text-amber-600" />
            서명할 서류가 {topDocs.length}건 있어요
          </h2>
          <div className="space-y-2">
            {topDocs.map((d, i) => {
              const when = docWhen(d.job_id)
              return (
                // 아랫줄 맨 앞에 근무가 언제인지 (근무 끝남·근무 시작됨은 빨강) · 줄이 차례로 살짝 올라옴 (0.25초 · 움직임 줄이기면 바로)
                <Link
                  key={d.id}
                  href={`/docs/${d.id}`}
                  className="flex animate-[rise_0.25s_var(--ease-spring)_both] items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3 font-semibold transition active:scale-[0.98]"
                  style={{ animationDelay: `${Math.min(i, 5) * 40}ms` }}
                  data-sign-doc={when.late ? 'late' : 'before'}
                >
                  <span className="min-w-0">
                    <span className="block">{d.title}</span>
                    <span className="block truncate text-xs font-medium text-mute">
                      {when.text && (
                        <>
                          <b className={when.late ? 'font-bold text-rose-600' : 'font-semibold text-amber-700'} data-sign-when>
                            {when.text}
                          </b>
                          {' · '}
                        </>
                      )}
                      {docJobLine(d.job_id)}
                    </span>
                  </span>
                  <span className={`shrink-0 whitespace-nowrap ${when.late ? 'text-rose-600' : 'text-brand-600'}`}>서명 →</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* 사진이 없으면 (사진 필수 전에 가입한 사람 포함) 열 때 등록 창을 띄우고, 카드로도 계속 안내
          · 지금 근무 중이면 창은 띄우지 않음 (근무 종료 버튼을 가리지 않게 · 아래 '얼굴 사진을 올려 주세요' 카드는 그대로) */}
      {!photoAt && user.role === 'worker' && !openAtt && <PhotoPrompt userId={user.id} name={user.name} />}
      {/* 알림을 안 켰으면 켜기 권유 (사진 등록 창이 떠 있으면 그 뒤에, '나중에'면 하루 쉼 · 근무 중에는 안 띄움) */}
      {!openAtt && <PushNudge publicKey={pushPublicKey()} reason="알림을 켜야 확정 소식을 놓치지 않아요" />}
      {/* 근무 날에는 출퇴근 버튼이 먼저 보이게 계좌·사진 안내를 오늘의 근무 아래로 */}
      {todayApps.length === 0 && profileNags}
      {/* 근무가 없는 날: 레벨 카드·이번 주·새 댓글·후기 권유가 먼저 */}
      {/* 확정 대기 칸이 맨 위로 올라온 때(지원하고 기다리는 중)는 레벨·이번 주 칸을 그 아래로 (지원한 공고가 첫 화면에 다 보이게) */}
      {todayApps.length === 0 && !waitingFirst && extras}
      {/* 지원하고 결과를 기다리는 중이면(오늘·다음 근무 없음) 그 공고부터 */}
      {waitingFirst && waitingSection}
      {waitingFirst && extras}

      <section id="today-work" className="scroll-mt-20">
        <h2 className="section-title">오늘의 {pro ? '일' : '근무'}</h2>
        {todayApps.length === 0 ? (
          nextApp ? (
            // 오늘 근무가 없으면 다음 근무를 크게 (며칠 남았는지·시간·장소·길찾기)
            // 이 근무는 아래 '예정된 근무' 목록에 다시 나오지 않음 → 달력에 넣기·전날 출근 확인도 여기에 (이번 주 칸을 누르면 이 카드로)
            <div
              id={`work-${nextApp.id}`}
              className="card scroll-mt-20 space-y-2 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--color-brand-500)_10%,white)_0%,white_60%)] ring-brand-100 target:ring-2 target:ring-brand-300"
              data-next-work
            >
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
              {/* 미리 알아 두면 좋은 휴게·식사 (공고에 적힌 그대로 · 한 줄씩) */}
              {(() => {
                const { brk, meal } = siteConditions(nextApp.job.conditions)
                return (
                  <>
                    {brk && <p className="truncate text-sm text-sub" data-next-break><Icon name="clock" className="text-mute" /> 휴게 {brk.value}</p>}
                    {meal && <p className="truncate text-sm text-sub" data-next-meal><Icon name="meal" className="text-mute" /> 식사 {meal.value}</p>}
                  </>
                )
              })()}
              {upcomingExtras(nextApp)}
              {changeNote(nextApp)}
              {latestAnnounce.has(nextApp.job_id) && noticeBox(latestAnnounce.get(nextApp.job_id)!, nextApp.job.company_id, '📢 담당자 공지', 'line-clamp-3')}
              {/* 전날 미리 챙기기: 근무 날 오늘 근무 카드와 같은 체크가 이어짐 */}
              {(() => {
                const items = [...new Set(`${nextApp.job.dress_code ?? ''},${nextApp.job.supplies ?? ''}`.split(/[,·、/\n]+/).map((x) => x.trim()).filter((x) => x.length > 0 && x.length <= 20))].slice(0, 8)
                return items.length >= 2 ? <PrepChecklist storageKey={`prep-${nextApp.job_id}-${firstDay(nextApp)}`} items={items} /> : null
              })()}
              {/* 360px에서 한 줄 (두 줄로 넘어가 '출퇴근을 눌러요.'만 떨어지던 것) */}
              <p className="text-xs text-mute" data-next-hint>오늘은 쉬는 날 · 근무 날 여기서 출퇴근해요</p>
              {/* 전날 미리: 휴대폰 달력에 넣기(.ics) · 가는 길 보기 (좌표가 있으면 길찾기, 주소만 있으면 지도) */}
              <div className="flex flex-wrap gap-1.5">
                <CalendarLink href={`/me/calendar/${nextApp.id}`} data-next-calendar />
                {nextMap && (
                  <a href={nextMap.route ?? nextMap.kakao} target="_blank" rel="noreferrer" className="chip h-8 px-3 text-xs" data-next-map>
                    <Icon name="route" /> {nextMap.route ? '길찾기' : '지도'}
                  </a>
                )}
              </div>
              {comingRow(nextApp)}
            </div>
          ) : waitingFirst && waitToday ? (
            // 오늘 근무가 확정 대기: 위 확정 대기 칸을 가리키는 한 줄 (다른 알바 보기를 권하지 않음 — 같은 날 겹쳐 지원하지 않게)
            // 누르면 그 공고 화면 (누름 반응 · 정기 개선 2026-11-21 15:35)
            <Link
              href={`/jobs/${waitTodayApp!.job_id}`}
              className="card-link flex items-center gap-3 py-3.5 text-sm"
              data-today-empty="waiting"
              data-today-wait-started={waitTodayStarted ? '' : undefined}
              transitionTypes={['nav-forward']}
            >
              <span className="relative flex size-2.5 shrink-0" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block font-semibold text-ink tabular-nums" data-today-wait-start>
                  오늘 {waitTodayStart}
                  {waitTodayStarted ? '에 시작했어요' : ' 시작'}
                </b>
                <span className="block text-xs text-mute">확정되면 바로 알려 드려요</span>
              </span>
              <span aria-hidden className="shrink-0 text-mute">
                ›
              </span>
            </Link>
          ) : waitingFirst ? (
            // 확정을 기다리는 지원이 위에 있으면 한 줄로만 (큰 빈 화면 안내가 그 칸을 아래로 밀지 않게)
            <Link href={pro ? '/pro' : '/'} className="card-link flex items-center justify-between gap-3 py-3.5 text-sm" data-today-empty="compact">
              <span className="min-w-0 text-sub">{pro ? '오늘 예정된 일이 없어요' : '오늘 예정된 근무가 없어요'}</span>
              <span className="shrink-0 font-semibold whitespace-nowrap text-brand-600">{pro ? '다른 의뢰 보기 →' : '다른 알바 보기 →'}</span>
            </Link>
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
            {[...todayApps]
              // 오늘 근무가 여럿이면 (예: 낮엔 A회사, 밤엔 B회사) 지금 할 근무가 맨 위:
              // 근무 중 → 아직 남은 근무 → 마친 근무 → 기록 없이 시간이 지난 근무 (지난 근무가 다음 근무를 아래로 밀지 않게)
              .sort((x, y) => todayRank(x) - todayRank(y))
              .map((a) => {
              const job = a.job
              const todayAtt = atts.find((t) => t.job_id === job.id && t.work_date === today)
              const open = openAtt?.job_id === job.id ? openAtt : null
              const jobDocs = pendingDocs.filter((d) => d.job_id === job.id)
              const docsLeft = jobDocs.length
              const notChosen = a.available_dates && !a.available_dates.includes(today)
              const map = mapLinks({ name: job.location_name, address: job.address, lat: job.lat, lng: job.lng })
              // 지난 근무를 종료하지 않고 그 근무 시간도 끝났으면: 끝난 시각을 따로 받음 (지금 누르면 다음 날 시각이 찍힘)
              const forgot = open && open.work_date < today && Date.now() >= scheduledEnd(shiftOf(job, open), open.work_date).getTime() ? open : null
              // 기록 없이 근무 시간이 지난 근무: 서명·출근 안내 대신 '시간이 지났어요' 한 칸 (휴게·준비물 줄도 뺌)
              const over = overNoRecord(a)
              return (
                <div key={a.id} className={`card relative space-y-4 ring-1 ${over ? 'ring-line' : 'ring-brand-100'}`} data-today-card={over ? 'over' : ''}>
                  <div>
                    <p className="truncate text-xs font-semibold text-mute">
                      {[job.company?.company_name && `🏢 ${job.company.company_name}`, job.event_name].filter(Boolean).join(' · ')}
                    </p>
                    {/* 제목을 누르면 공고 (인사이트: 오늘 근무 카드 제목을 여러 번 눌러도 아무 일이 없었음) */}
                    <h3 className="text-lg font-bold">
                      <Link href={`/jobs/${job.id}`} className="transition-opacity active:opacity-60" data-today-title>
                        {job.title}
                        <span aria-hidden className="whitespace-nowrap text-base font-semibold text-mute">{'\u00a0'}›</span>
                      </Link>
                    </h3>
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
                    {/* 출근 전에 챙길 것: 집결 장소·복장·준비물 + 현장에서 자주 묻는 휴게·식사 (담당자가 공고에 적은 그대로) */}
                    {(() => {
                      const { brk, meal } = siteConditions(job.conditions)
                      const win = brk ? breakWindow(brk.value) : null
                      const nowT = kstTime(new Date())
                      // 근무 중이고 지금이 휴게 시간이면: '지금 휴게 시간 · 13:00까지' (초록 점이 천천히 깜빡 · 움직임 줄이기면 멈춤)
                      const breakNow = !!(open && win && nowT >= win.start && nowT < win.end)
                      if (over || !(job.meeting_point || job.dress_code || job.supplies || brk || meal)) return null
                      return (
                      <ul className="mt-2 space-y-1 rounded-xl bg-bg px-3 py-2.5 text-sm">
                        {brk &&
                          (breakNow ? (
                            <li className="flex items-center gap-1.5 font-semibold text-emerald-700" data-break-now>
                              <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                              지금 휴게 시간 · {win!.end}까지
                            </li>
                          ) : (
                            <li className="truncate" data-break>
                              <Icon name="clock" className="text-mute" /> <b className="font-semibold text-sub">휴게</b> {brk.value}
                            </li>
                          ))}
                        {meal && (
                          <li className="truncate" data-meal>
                            <Icon name="meal" className="text-mute" /> <b className="font-semibold text-sub">식사</b> {meal.value}
                          </li>
                        )}
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
                      )
                    })()}
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
                      return n ? noticeBox(n, job.company_id, signalOf(n.body) === 'change' ? SIGNAL.change : '📢 담당자 공지', 'line-clamp-3') : null
                    })()}
                    {(() => {
                      // 현장 담당 번호가 없으면 회사 문의 담당자 (전화·문자 버튼은 같은 자리)
                      const co = !job.manager_phone ? coContact.get(job.company_id) : undefined
                      const who = job.manager_phone
                        ? { label: `현장 담당 ${job.manager_name ?? ''}`.trim(), phone: job.manager_phone, name: `담당자 ${job.manager_name ?? ''}`.trim(), kind: 'site' }
                        : co
                          ? { label: `회사 담당 ${co.name ?? ''}`.trim(), phone: co.phone, name: `${job.company?.company_name ?? '회사'} 담당자`, kind: 'company' }
                          : null
                      if (!who && !map) return null
                      return (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        {who && (
                          <>
                            <span className="text-sub" data-today-contact={who.kind}>
                              {who.label}
                            </span>
                            <ContactButtons phone={who.phone} name={who.name} showNumber={false} />
                          </>
                        )}
                        {map && (
                          <a href={map.route ?? map.kakao} target="_blank" rel="noreferrer" className="contact-btn bg-bg text-sub hover:bg-line">
                            <Icon name="route" /> {map.route ? '길찾기' : '지도'}
                          </a>
                        )}
                      </div>
                      )
                    })()}
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
                  ) : open ? (
                    // 이미 근무 중이면 (담당자가 출석 체크로 시작해 줬거나, 시작한 뒤 서류가 새로 왔으면) 서류가 남아도 '근무 종료'는 그대로
                    <div className="space-y-2">
                      <ClockPanel
                        jobId={job.id}
                        open={{ id: open.id, clock_in: open.clock_in, startText: kstTime(open.clock_in) }}
                        endAt={scheduledEnd(todayShift(job, open), open.work_date).toISOString()}
                        endText={hhmm(todayShift(job, open).end_time)}
                        useLocation={job.lat != null}
                        gpsRequired={job.gps_required}
                        serverNow={Date.now()}
                        paidFrom={paidFromOf(job, open)}
                      />
                      {docsLeft > 0 && (
                        <Link
                          id={signAnchorJob === job.id ? 'sign-docs' : undefined}
                          href={`/docs/${jobDocs[0].id}`}
                          className="flex scroll-mt-24 items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 transition active:scale-[0.98]"
                          data-sign-left
                        >
                          <span className="min-w-0 flex-1 truncate font-semibold">서명할 서류 {docsLeft}건이 남았어요</span>
                          <span className="shrink-0 font-bold whitespace-nowrap">서명 ›</span>
                        </Link>
                      )}
                    </div>
                  ) : docsLeft > 0 && !over ? (
                    // 누르면 바로 그 서류 서명 화면 (위로 올라가 찾지 않게) · 여러 건이면 서명 뒤 다음 서류로 이어짐
                    <Link
                      id={signAnchorJob === job.id ? 'sign-docs' : undefined}
                      href={`/docs/${jobDocs[0].id}`}
                      className="flex scroll-mt-24 items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 transition active:scale-[0.98]"
                      data-sign-before-start
                    >
                      <span className="min-w-0 flex-1 font-semibold text-balance">서류 {docsLeft}건에 서명하면 근무를 시작할 수 있어요</span>
                      <span className="shrink-0 font-bold whitespace-nowrap">서명 ›</span>
                    </Link>
                  ) : todayAtt?.clock_out ? (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-bg px-4 py-3 text-center">
                        <p className="font-bold">오늘 근무 완료 👏</p>
                        {/* 담당자가 고친(보정) 시각이 있으면 그것으로 */}
                        <p className="text-sm text-sub">
                          {kstTime(todayAtt.adj_in ?? todayAtt.clock_in)} ~ {kstTime(todayAtt.adj_out ?? todayAtt.clock_out)} (
                          {minutesText(calcDay(job, todayAtt).paidMin)} 인정)
                        </p>
                        {/* 30분 단위 등으로 빠진 시간이 있으면 한 줄로 (왜 덜 인정됐는지 바로 알 수 있게) */}
                        {roundCut(calcDay(job, todayAtt)) > 0 && (
                          <p className="text-xs text-mute" data-round-cut>
                            {job.round_unit}분 단위 계산이라 {minutesText(roundCut(calcDay(job, todayAtt)))}은 빠졌어요
                          </p>
                        )}
                        {/* 오늘 번 돈 (세금 떼기 전, 연장은 서로 확인한 만큼만) · 0에서 올라가며 보임 */}
                        {calcDay(job, todayAtt).gross > 0 && (
                          <p className="mt-1 text-lg font-extrabold text-brand-700 tabular-nums" data-today-gross>
                            오늘 약 <LiveNumber value={calcDay(job, todayAtt).gross} countUp />원 <span className="text-xs font-semibold text-mute">세전</span>
                          </p>
                        )}
                      </div>
                      {/* 예정보다 일찍 끝났으면: 근로조건대로 시간 인정 요청 (담당자 승인 → 정산에 그대로) */}
                      {!todayAtt.paid &&
                        (() => {
                          const end = scheduledEnd(todayShift(job, todayAtt), todayAtt.work_date)
                          const out = new Date(todayAtt.adj_out ?? todayAtt.clock_out)
                          const sent = fixSent(job.id)
                          const early = out.getTime() < end.getTime() - 60_000
                          const ans = sent ? null : fullAnswer(job.id)
                          // 담당자가 답했으면 결과 한 줄 (인정: 기록이 정말 바뀌었을 때만 초록 · 실제대로: 아직 일찍 끝난 채일 때 회색 + 문의)
                          // (답한 뒤 담당자가 기록을 다시 고쳤으면 결과 대신 전처럼 요청 칸)
                          const answer = ans && (ans.ok ? !early : early) ? ans : null
                          if (answer)
                            return answer.ok ? (
                              <p className="animate-pop rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800" role="status" data-full-time-answer="ok">
                                {/* 휴대폰 한 줄에 들어가게 짧게 */}
                                ✓ {answer.time ? `${answer.time}까지 ` : ''}시간 인정됐어요
                              </p>
                            ) : (
                              <p className="flex items-center justify-between gap-2 rounded-xl bg-bg px-3.5 py-2.5 text-sm text-sub" data-full-time-answer="no">
                                <span className="min-w-0">실제 종료 시각대로 계산해요</span>
                                <Link href={`/me/chat?co=${job.company_id}`} className="shrink-0 font-semibold whitespace-nowrap text-brand-700">
                                  문의 →
                                </Link>
                              </p>
                            )
                          return early || sent?.full ? (
                            <FullTimeRequest attendanceId={todayAtt.id} endText={kstTime(end)} outText={kstTime(out)} sent={sent?.full ? sent.at : null} />
                          ) : null
                        })()}
                      {!todayAtt.paid && (
                        <FixRequest
                          attendanceId={todayAtt.id}
                          workDate={todayAtt.work_date}
                          inAt={todayAtt.adj_in ?? todayAtt.clock_in}
                          outAt={(todayAtt.adj_out ?? todayAtt.clock_out)!}
                          inText={kstTime(todayAtt.adj_in ?? todayAtt.clock_in)}
                          outText={kstTime(todayAtt.adj_out ?? todayAtt.clock_out)}
                          sent={fixSent(job.id)?.full ? null : fixSent(job.id)}
                        />
                      )}
                    </div>
                  ) : !arriveSent.has(job.id) && Date.now() >= scheduledEnd(todayShift(job), today).getTime() ? (
                    // 근무 시간이 다 지났는데 출근 기록이 없음: 큰 '근무 시작' 대신 안내 + 담당자에게 알리기
                    // (끝난 뒤에 근무 시작을 누르면 금액이 0인 기록이 생김) · 정말 지금 시작해야 하면 접힌 칸에서
                    <div className="space-y-2 rounded-xl bg-bg px-4 py-3" data-shift-over>
                      <p className="font-bold">오늘 근무 시간이 지났어요</p>
                      <p className="text-sm text-sub">
                        {hhmm(todayShift(job).start_time)}~{hhmm(todayShift(job).end_time)} · 출근 기록이 없어요
                      </p>
                      <Link
                        href={`/me/chat?co=${job.company_id}&ask=missed`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-bold text-brand-700 ring-1 ring-line transition active:scale-[0.98]"
                        data-shift-over-ask
                      >
                        출근했다면 담당자에게 알리기 →
                      </Link>
                      {docsLeft > 0 && (
                        // 출근했는데 기록만 빠졌다면 서류도 필요 (작게 · 큰 '서명하면 시작' 안내는 시간이 지나 맞지 않음)
                        <Link href={`/docs/${jobDocs[0].id}`} className="tap block text-sm font-semibold text-amber-700" data-shift-over-sign>
                          서명할 서류 {docsLeft}건 ›
                        </Link>
                      )}
                      <details className="text-sm">
                        <summary className="cursor-pointer py-1 font-semibold text-sub">지금 근무를 시작해야 하나요?</summary>
                        <div className="mt-2">
                          <ClockPanel jobId={job.id} open={null} useLocation={job.lat != null} gpsRequired={job.gps_required} askedAt={arriveSent.get(job.id)} />
                        </div>
                      </details>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* 출근 확인을 요청해 두었으면 '근무 시작을 눌러 주세요' 안내는 빼고 (기다리는 중 안내만) */}
                      {!arriveSent.has(job.id) && <StartCountdown
                        startAt={kstAt(today, todayShift(job).start_time).toISOString()}
                        endAt={scheduledEnd(todayShift(job), today).toISOString()}
                        startText={hhmm(todayShift(job).start_time)}
                        serverNow={Date.now()}
                        confirmedAt={a.decided_at}
                      />}
                      <ClockPanel
                        jobId={job.id}
                        open={null}
                        useLocation={job.lat != null}
                        gpsRequired={job.gps_required}
                        askedAt={arriveSent.get(job.id)}
                        startAt={kstAt(today, todayShift(job).start_time).toISOString()}
                        paidFrom={job.early_clamp ? hhmm(todayShift(job).start_time) : undefined}
                      />
                    </div>
                  )}
                  {/* 출근 전이고 근무가 끝나기 전: 늦으면 담당자에게 알리기 */}
                  {!todayAtt && !open && !notChosen && new Date() < scheduledEnd(todayShift(job), today) && (
                    <LateNotice
                      jobId={job.id}
                      sent={lateSent.get(job.id) ?? null}
                      startAt={kstAt(today, job.start_time).toISOString()}
                      started={Date.now() > kstAt(today, job.start_time).getTime()}
                      // 시작 뒤에 확정된 사람: 확정 알림이 '도착 시간 알리기'를 가리키므로 눈에 띄게
                      stress={!!a.decided_at && Date.parse(a.decided_at) > kstAt(today, job.start_time).getTime()}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
      {todayApps.length > 0 && profileNags}
      {/* 근무 날: 출퇴근 버튼(오늘의 근무)과 할 일 다음에 레벨 카드·이번 주 등 (버튼이 첫 화면에 보이게) */}
      {todayApps.length > 0 && extras}

      {restUpcoming.length > 0 && (
        <section>
          <h2 className="section-title">예정된 근무</h2>
          <div className="stagger space-y-2">
            {restUpcoming.map((a) => (
              <div key={a.id} id={`work-${a.id}`} className="card scroll-mt-20 py-4 target:ring-2 target:ring-brand-300">
              <div className="flex items-center gap-3">
                <Link href={`/jobs/${a.job_id}`} className="min-w-0 flex-1">
                  <p className="font-bold">{a.job.title}</p>
                  <CompanyName job={a.job} />
                  <p className="text-sm text-sub">
                    {fmtDateRange(a.job.start_date, a.job.end_date)} {scheduleText(a.job)}
                  </p>
                  {a.available_dates && <p className="mt-0.5 text-xs font-semibold text-brand-700"><Icon name="calendar" /> 내 근무일 {a.available_dates.map(fmtDate).join(' · ')}</p>}
                  {upcomingExtras(a)}
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`badge ${APP_STATUS.approved.cls}`}>확정</span>
                  {/* 휴대폰 달력에 넣기 (.ics) */}
                  <CalendarLink href={`/me/calendar/${a.id}`} />
                </div>
              </div>
              {changeNote(a)}
              {latestAnnounce.has(a.job_id) && noticeBox(latestAnnounce.get(a.job_id)!, a.job.company_id, '📢 담당자 공지', 'line-clamp-2')}
              {comingRow(a)}
              </div>
            ))}
          </div>
        </section>
      )}

      {!waitingFirst && waitingSection}

      {history.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold">근무 내역 · 급여</h2>
            <Link href="/me/history" className="tap text-sm font-semibold text-brand-600">
              지난 근무 전체 →
            </Link>
          </div>
          <div className="stagger space-y-2">
            {history.slice(0, 3).map(({ job, s, live, liveOver, paid }) => {
              // 첫날 근무 중: 오른쪽에 '오늘 근무 중 / 끝나면 계산돼요' 한 번만 (왼쪽에 같은 말 반복 안 함)
              const firstLive = live > 0 && s.days === 0
              const miss = s.incomplete - live
              return (
              <div key={job.id} className="card space-y-3" data-history-job={job.id}>
                <div className="flex items-start justify-between gap-3">
                  {/* 제목·회사·날짜 줄 어디를 눌러도 공고로 (이용 기록: 회사·날짜 줄을 여러 번 누름) — 제목 링크가 왼쪽 칸 전체를 덮음 */}
                  <div className="relative min-w-0" data-history-info>
                    {/* 제목을 누르면 공고 ('지난 근무' 화면과 같게 — 이용 기록: 제목을 눌러도 반응이 없어 여러 번 누름) */}
                    <Link href={`/jobs/${job.id}`} className="block font-bold transition-opacity after:absolute after:inset-0 after:content-[''] active:opacity-60" data-history-title>
                      {job.title}
                      <span aria-hidden className="whitespace-nowrap text-sm font-semibold text-mute">{'\u00a0'}›</span>
                    </Link>
                    <CompanyName job={job} />
                    {(!firstLive || miss > 0) && (
                      <p className="text-sm text-sub">
                        {/* 첫날 근무 중이면 '0일 · 0분' 없이 (오른쪽에 '오늘 근무 중') */}
                        {!firstLive && `${s.days}일 · ${minutesText(s.paidMin)}`}
                        {live > 0 && !firstLive && (
                          <span className={`font-semibold ${liveOver ? 'text-amber-600' : 'text-emerald-600'}`} data-live-shift data-live-over={liveOver ? '' : undefined}>
                            {' · '}
                            {liveOver ? '오늘 종료 전' : '오늘 근무 중'}
                          </span>
                        )}
                        {miss > 0 && <span className="text-amber-600">{firstLive ? '' : ' · '}종료 기록 없음 {miss}일</span>}
                      </p>
                    )}
                    {/* 언제 들어오는지 (정산 예정 · D-n / 지났으면 바로 문의) — 지난 근무와 같은 한 줄 */}
                    {!paid && !firstLive && pd && <PaydayLine jobId={job.id} companyId={job.company_id} label={pd.label(job)} due={pd.due(job)} asked={pd.asked(job)} today={today} />}
                  </div>
                  <div className="shrink-0 text-right">
                    {firstLive ? (
                      // 첫날 근무 중: 0원 대신 (퇴근하면 계산됨)
                      <>
                        <p className={`text-base font-extrabold whitespace-nowrap ${liveOver ? 'text-amber-600' : 'text-emerald-600'}`} data-live-shift data-live-over={liveOver ? '' : undefined}>
                          {liveOver ? '근무 종료 전' : '오늘 근무 중'}
                        </p>
                        <p className="text-xs whitespace-nowrap text-mute">{liveOver ? '종료를 눌러야 계산돼요' : '끝나면 계산돼요'}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-extrabold whitespace-nowrap">{won(s.net)}</p>
                        {paid ? (
                          // 지급 끝: 체크가 그려지며 초록 (들어왔다는 걸 한눈에)
                          <p className="flex items-center justify-end gap-0.5 text-xs font-bold whitespace-nowrap text-emerald-700" data-paid-done>
                            <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="check-draw" />
                            </svg>
                            지급완료
                          </p>
                        ) : (
                          <p className="text-xs whitespace-nowrap text-mute">실수령 예상</p>
                        )}
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
              )
            })}
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
                    docChanged(d) ? (
                      // 서명 뒤 일정이 바뀐 서류: 열면 위에 바뀐 내용이 보임
                      <span className="shrink-0 text-xs font-semibold whitespace-nowrap text-amber-700" data-my-doc-changed>
                        일정 바뀜 →
                      </span>
                    ) : (
                      <span className="shrink-0 whitespace-nowrap text-mute">보기 →</span>
                    )
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
