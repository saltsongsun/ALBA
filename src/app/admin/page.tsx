import PushLevel from '@/components/PushLevel'
import { myPushLevel } from '@/app/actions/push'
import SlotBar from '@/components/SlotBar'
import Icon, { type IconName } from '@/components/Icon'
import Link from 'next/link'
import JobActions from '@/components/JobActions'
import { InstallBanner } from '@/components/InstallGuide'
import { decideApplication, decideSelected, holdApplication, setJobStatus } from '@/app/actions/admin'
import { BULK_FORM, BulkApproveBar, PickAll } from '@/components/BulkApprove'
import { contractNameOf } from '@/lib/members'
import AutoRefresh from '@/components/AutoRefresh'
import Avatar from '@/components/Avatar'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import LiveNumber from '@/components/LiveNumber'
import PushToggle from '@/components/PushToggle'
import { ConfirmSubmit, CopyButton, ShareButton, SubmitButton } from '@/components/ui'
import { countApps, getSettings, hasSeal, JOB_WITH_APP_STATUS, otherCompaniesUnread, unpaidByJob, unreadForAdmins, type JobWithAppStatus } from '@/lib/data'
import { switchCompany } from '@/app/actions/company'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { isFullTimeAsk, pendingFix, signalOf } from '@/lib/signals'
import { pushPublicKey } from '@/lib/push'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { missingSetup } from '@/lib/setup'
import { ago, companyReviews } from '@/lib/community'
import { companyWorkerIds } from '@/lib/company'
import StartsIn from '@/components/StartsIn'
import NewsNote from '@/components/NewsNote'
import { won } from '@/lib/format'
import { hoursText, weeklyImpact, type WeekImpact } from '@/lib/weekly'
import { ageOn, fmtDate, fmtDateRange, hhmm, kstAt, kstDate, kstDateTime } from '@/lib/time'

const ICONS = {
  working: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  pending: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" />,
  docs: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />,
  people: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
}

function Stat({ label, value, href, icon, tone }: { label: string; value: number; href: string; icon: keyof typeof ICONS; tone: string }) {
  return (
    // 이름은 한 줄 (휴대폰 두 칸에서도 꺾이지 않게 그림은 숫자 옆으로)
    <Link href={href} className="card-link block px-4 py-3 sm:px-5 sm:py-4">
      <p className="truncate text-sm font-semibold whitespace-nowrap text-mute">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[26px] leading-tight font-extrabold sm:text-3xl">
          <LiveNumber value={value} countUp />
        </p>
        <span className={`grid size-8 shrink-0 place-items-center rounded-full ${tone}`}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {ICONS[icon]}
          </svg>
        </span>
      </div>
    </Link>
  )
}

type MyShift = {
  job: { id: string; title: string; company_id: string; start_date: string; end_date: string; start_time: string; end_time: string; status: string; company: { company_name: string } | null }
  working: boolean
}

/**
 * 한 계정으로 두 역할: 맡지 않은 회사에서 오늘 근무자로 확정된 근무 (끝낸 근무는 빼고).
 * 관리자는 접속하면 관리자 화면부터 열려서, 오늘 일하러 가는 날엔 출근 화면으로 바로 가게 대시보드 맨 위에 보여 줌
 */
async function myShiftToday(userId: string, managed: string[]): Promise<MyShift | null> {
  const today = kstDate()
  const { data } = await db()
    .from('applications')
    .select('available_dates, job:jobs(id, title, company_id, start_date, end_date, start_time, end_time, status, company:companies(company_name))')
    .eq('user_id', userId)
    .eq('status', 'approved')
  const hits = ((data ?? []) as unknown as { available_dates: string[] | null; job: MyShift['job'] | null }[]).filter(
    (r): r is { available_dates: string[] | null; job: MyShift['job'] } =>
      !!r.job &&
      !managed.includes(r.job.company_id) &&
      !['cancelled', 'draft'].includes(r.job.status) &&
      r.job.start_date <= today &&
      r.job.end_date >= today &&
      (!r.available_dates?.length || r.available_dates.includes(today)),
  )
  if (!hits.length) return null
  const { data: atts } = await db().from('attendance').select('job_id, clock_in, clock_out').eq('user_id', userId).eq('work_date', today)
  const rows = (atts ?? []) as { job_id: string; clock_in: string | null; clock_out: string | null }[]
  // 아직 안 끝낸 근무 (근무 중이면 그것부터)
  const left = hits
    .map((h) => ({ job: h.job, att: rows.find((a) => a.job_id === h.job.id) }))
    .filter((x) => !x.att?.clock_out)
    .sort((a, b) => Number(!!b.att?.clock_in) - Number(!!a.att?.clock_in) || a.job.start_time.localeCompare(b.job.start_time))
  return left[0] ? { job: left[0].job, working: !!left[0].att?.clock_in } : null
}

export default async function AdminHome(props: PageProps<'/admin'>) {
  const admin = await requireAdmin()
  const sp = await props.searchParams
  // 다른 조회와 상관없는 것(외주·시작하기·후기)은 먼저 출발 (한 번에 기다리는 횟수를 줄임)
  // 외주: 지급일 지남·곧 지급·지급했는데 세금계산서 없음·마감 지난 견적
  // 대표 관리자: 승인을 기다리는 관리자 가입 신청
  const isOwner = admin.isSuper || admin.companies.find((c) => c.id === admin.companyId)?.role === 'owner'
  const vendorP = Promise.all([
    db()
      .from('vendor_payments')
      .select('id, due_date, paid_at, invoice_at').eq('company_id', admin.companyId)
      .then((r) => (r.error ? [] : (r.data as { id: string; due_date: string | null; paid_at: string | null; invoice_at: string | null }[]))),
    db()
      .from('quote_requests')
      .select('id, title, due_date, status').eq('company_id', admin.companyId)
      .eq('status', 'open')
      .then((r) => (r.error ? [] : (r.data as { id: string; title: string; due_date: string | null; status: string }[]).filter((q) => q.status === 'open'))),
    db()
      .from('quotes')
      .select('request_id, amount')
      .then((r) => (r.error ? [] : (r.data as { request_id: string; amount: number | null }[]))),
    isOwner
      ? db()
          .from('company_join_requests')
          .select('user_id', { count: 'exact', head: true })
          .eq('company_id', admin.companyId)
          .then((r) => (r.error ? 0 : (r.count ?? 0)))
      : 0,
    // 새 회사 시작하기 체크리스트: 공고를 올린 적·지원을 받은 적·관리자가 더 있는지
    db().from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', admin.companyId).then((r) => r.count ?? 0),
    db().from('applications').select('id', { count: 'exact', head: true }).eq('company_id', admin.companyId).then((r) => r.count ?? 0),
    db().from('company_members').select('user_id', { count: 'exact', head: true }).eq('company_id', admin.companyId).then((r) => r.count ?? 0),
  ])
  // 우리 회사 근무자 후기 (별명, 커뮤니티에 모두 공개된 것과 같음). 못 읽어도 대시보드는 그대로
  const reviewsP = companyReviews(admin.companyId, 2).catch(() => null)
  // 다른 회사에서 오늘 내 근무 (운영자 계정은 근무자로 지원하지 않음)
  const myShiftP = admin.isSuper
    ? Promise.resolve(null)
    : myShiftToday(
        admin.id,
        admin.companies.map((c) => c.id),
      ).catch(() => null)
  // 여러 회사를 맡았으면: 다른 회사에 온 새 문의 (바로 그 회사로 바꿔 보기)
  const othersP = admin.companies.length > 1 ? otherCompaniesUnread(admin.companies, admin.companyId).catch(() => []) : Promise.resolve([])
  // (아래 다른 조회가 먼저 실패해도 '처리 안 된 실패'로 서버가 멈추지 않게)
  vendorP.catch(() => {})
  const today = kstDate()
  const [settings, sealSet, activeJobs, pending, working, pendingDocs, workerCount, unreadChats] = await Promise.all([
    getSettings(admin.companyId),
    hasSeal(admin.companyId),
    db()
      .from('jobs')
      .select(JOB_WITH_APP_STATUS).eq('company_id', admin.companyId)
      .in('status', ['open', 'closed'])
      .gte('end_date', today)
      .order('start_date')
      .then((r) => must(r) as JobWithAppStatus[]),
    db()
      .from('applications')
      .select('id, created_at, message, available_dates, job:jobs(id, title, end_date), user:users(id, name, phone, birth_date, photo_at)').eq('company_id', admin.companyId)
      .eq('status', 'applied')
      .is('held_at', null) // 보류한 지원자는 '확정 대기'에서 빼고 공고의 지원자 탭 '보류'에서
      .order('created_at', { ascending: false })
      .limit(30)
      .then(
        (r) =>
          must(r) as unknown as {
            id: string
            created_at: string
            message: string | null
            available_dates: string[] | null
            job: { id: string; title: string; end_date: string }
            user: { id: string; name: string; phone: string; birth_date: string | null; photo_at: string | null }
          }[],
      ),
    db().from('attendance').select('job_id').eq('company_id', admin.companyId).is('clock_out', null).then((r) => must(r) as { job_id: string }[]),
    db().from('signed_docs').select('id', { count: 'exact', head: true }).eq('company_id', admin.companyId).eq('status', 'pending'),
    // 가입한 근무자 수 (근무자 계정은 모든 회사 공용, 외주 업체 계정은 빼고)
    // 확인 전인 회사는 근무자 화면처럼 '우리 회사에 지원한 회원'만 셈 (눌러 들어간 명단과 숫자가 같게 · 전체 회원 수는 확인 뒤)
    admin.companyVerified
      ? db().from('users').select('id', { count: 'exact', head: true }).eq('role', 'worker').eq('active', true).neq('member_type', 'vendor').then((r) => ({ count: r.count }))
      : companyWorkerIds(admin.companyId).then((ids) => ({ count: ids.length as number | null })),
    unreadForAdmins(admin.companyId),
  ])
  const counts = countApps(activeJobs, 'approved')
  const waitingBy = countApps(activeJobs, 'applied')
  // 곧(모레까지) 시작하거나 진행 중인데 확정 인원이 모자란 행사: 취소로 빈자리가 생겼을 때 바로 보이게
  const soon = kstDate(new Date(Date.now() + 2 * 86_400_000))
  const tomorrow = kstDate(new Date(Date.now() + 86_400_000))
  const short = activeJobs.filter((j) => j.start_date <= soon && (counts[j.id] ?? 0) < j.headcount)
  // 이미 시작한 행사 (어제 이전 시작 · 오늘 시작 시각이 지남): '오늘 09:00 시작' 대신 '진행 중'
  const nowAt = Date.now()
  const begun = (j: { start_date: string; start_time: string }) => j.start_date < today || (j.start_date === today && kstAt(today, hhmm(j.start_time)).getTime() <= nowAt)
  const todayJobs = activeJobs.filter((j) => j.start_date <= today && j.end_date >= today)
  const workingBy: Record<string, number> = {}
  for (const w of working) workingBy[w.job_id] = (workingBy[w.job_id] ?? 0) + 1
  // 오늘 행사의 미출근: 오늘 근무하기로 한 확정자 중 출근 기록이 없는 사람 (시작 시각이 지난 행사만 표시)
  const todayIds = todayJobs.map((j) => j.id)
  const todayP = todayIds.length
    ? Promise.all([
        db()
          .from('applications')
          .select('job_id, user_id, available_dates').eq('company_id', admin.companyId)
          .in('job_id', todayIds)
          .eq('status', 'approved')
          .then((r) => must(r) as { job_id: string; user_id: string; available_dates: string[] | null }[]),
        db()
          .from('attendance')
          .select('job_id, user_id').eq('company_id', admin.companyId)
          .in('job_id', todayIds)
          .eq('work_date', today)
          .then((r) => must(r) as { job_id: string; user_id: string }[]),
      ])
    : Promise.resolve([[], []] as [{ job_id: string; user_id: string; available_dates: string[] | null }[], { job_id: string; user_id: string }[]])
  const started = (j: JobWithAppStatus) => kstAt(today, j.start_time) <= new Date()

  const group0 = <T,>(rows: T[], keyOf: (r: T) => string) => {
    const m = new Map<string, T[]>()
    for (const r of rows) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r])
    return [...m.values()]
  }
  // 확인할 일: 공고마다 흩어진 '답을 기다리는 일'을 한곳에 (공고·날짜별로 묶어 바로 그 화면으로)
  const titleOf = new Map(activeJobs.map((j) => [j.id, j.title]))
  const outsideJobs = activeJobs.filter((j) => j.contract_method !== 'app' && j.start_date <= soon)
  // 내일 근무하는데 앱 서류(근로계약서 등)에 아직 서명 안 한 확정자 (현장에서 출근이 막히지 않게 하루 전에)
  const tomorrowJobs = activeJobs.filter((j) => j.start_date <= tomorrow && j.end_date >= tomorrow && j.contract_method !== 'paper' && j.contract_method !== 'external')
  // 오늘 출근 현황과 확인할 일 조회를 한꺼번에
  todayP.catch(() => {})
  const [[todayApps, todayAtts], [otAsk, shiftWait, openOld, arriveMsgs, outsideApps, unsignedTomorrow, fixMsgs, unpaid]] = await Promise.all([todayP, Promise.all([
    // 근무자가 계약 시간 이후 근무를 확인해 달라고 한 것
    db()
      .from('attendance')
      .select('job_id, work_date, job:jobs(title)').eq('company_id', admin.companyId)
      .eq('ot_status', 'pending')
      .eq('ot_by', 'worker')
      .eq('paid', false)
      .limit(200)
      .then((r) => must(r) as unknown as { job_id: string; work_date: string; job: { title: string } | null }[]),
    // 근무시간 변경에 아직 답하지 않은 근무자
    db()
      .from('shift_changes')
      .select('job_id, work_date, status').eq('company_id', admin.companyId)
      .eq('status', 'pending')
      .limit(500)
      .then((r) => (must(r) as { job_id: string; work_date: string | null; status: string }[]).filter((c) => c.status === 'pending')),
    // 지난 날짜인데 근무 종료를 안 누른 기록
    db()
      .from('attendance')
      .select('job_id, work_date, clock_out, job:jobs(title)').eq('company_id', admin.companyId)
      .is('clock_out', null)
      .lt('work_date', today)
      .limit(200)
      .then((r) =>
        (must(r) as unknown as { job_id: string; work_date: string; clock_out: string | null; job: { title: string } | null }[]).filter(
          (a) => !a.clock_out && a.work_date < today,
        ),
      ),
    // 오늘 현장 위치 확인이 안 돼 출근 확인을 요청한 근무자
    todayIds.length
      ? db()
          .from('messages')
          .select('thread_user_id, job_id, body, created_at').eq('company_id', admin.companyId)
          .in('job_id', todayIds)
          .eq('from_admin', false)
          .gte('created_at', kstAt(today, '00:00').toISOString())
          .limit(300)
          .then((r) =>
            (must(r) as { thread_user_id: string; job_id: string; body: string; created_at: string }[]).filter(
              (m) => kstDate(m.created_at) === today && signalOf(m.body) === 'arrive',
            ),
          )
      : [],
    // 곧 시작하는(진행 중 포함) 종이·외부 계약서 공고의 확정자 중 아직 계약서를 안 받은 사람
    outsideJobs.length
      ? db()
          .from('applications')
          .select('job_id, contract_received_at').eq('company_id', admin.companyId)
          .in('job_id', outsideJobs.map((j) => j.id))
          .eq('status', 'approved')
          .then((r) => (must(r) as { job_id: string; contract_received_at: string | null }[]).filter((a) => !a.contract_received_at))
      : [],
    tomorrowJobs.length
      ? Promise.all([
          db()
            .from('applications')
            .select('job_id, user_id, available_dates').eq('company_id', admin.companyId)
            .in('job_id', tomorrowJobs.map((j) => j.id))
            .eq('status', 'approved')
            .then((r) => must(r) as { job_id: string; user_id: string; available_dates: string[] | null }[]),
          db()
            .from('signed_docs')
            .select('job_id, user_id, status').eq('company_id', admin.companyId)
            .in('job_id', tomorrowJobs.map((j) => j.id))
            .eq('status', 'pending')
            .then((r) => (must(r) as { job_id: string; user_id: string; status: string }[]).filter((d) => d.status === 'pending')),
        ]).then(([apps, docs]) => {
          const pending = new Set(docs.map((d) => `${d.job_id}|${d.user_id}`))
          return apps.filter((a) => (!a.available_dates || a.available_dates.includes(tomorrow)) && pending.has(`${a.job_id}|${a.user_id}`))
        })
      : [],
    // 오늘 근무자가 보낸 기록 정정 요청과 그 답 (답하지 않은 것만 셈)
    todayIds.length
      ? db()
          .from('messages')
          .select('thread_user_id, job_id, body, created_at, from_admin').eq('company_id', admin.companyId)
          .in('job_id', todayIds)
          .gte('created_at', kstAt(today, '00:00').toISOString())
          .limit(500)
          .then((r) =>
            (must(r) as { thread_user_id: string; job_id: string; body: string; created_at: string; from_admin: boolean }[]).filter((m) =>
              ['fix', 'fixDone', 'fixNo'].includes(signalOf(m.body) ?? ''),
            ),
          )
      : [],
    // 끝난 행사인데 아직 '지급 완료'로 처리하지 않은 근무자 (급여 지급을 빠뜨리지 않게)
    unpaidByJob(admin.companyId, today),
  ])])
  const arrived = new Set(todayAtts.map((a) => `${a.job_id}|${a.user_id}`))
  const absentBy: Record<string, number> = {}
  for (const a of todayApps) {
    if (a.available_dates && !a.available_dates.includes(today)) continue
    if (!arrived.has(`${a.job_id}|${a.user_id}`)) absentBy[a.job_id] = (absentBy[a.job_id] ?? 0) + 1
  }
  const fixWait = group0(fixMsgs, (m) => `${m.job_id}|${m.thread_user_id}`)
    .map((g) => pendingFix(g, today))
    .filter((m) => m !== null)
  type Todo = { key: string; icon: IconName; text: string; n: number; href: string; tone: string; unit?: string }
  const [vpays, vreqs, vquotes, joinWait, jobsEver, appsEver, memberCount] = await vendorP
  const [reviews, otherUnread, myShift] = await Promise.all([reviewsP, othersP, myShiftP])
  const in3 = kstDate(new Date(Date.now() + 3 * 86_400_000))
  const payOverdue = vpays.filter((p) => !p.paid_at && p.due_date && p.due_date < today)
  const paySoon = vpays.filter((p) => !p.paid_at && p.due_date && p.due_date >= today && p.due_date <= in3)
  const paidNoInvoice = vpays.filter((p) => p.paid_at && !p.invoice_at)
  const quoteDue = vreqs.filter((r) => r.due_date && r.due_date <= today && vquotes.some((q) => q.request_id === r.id && q.amount != null))
  const vendorTodos: Todo[] = ([
    joinWait > 0 && { key: 'join', icon: 'users' as const, text: '관리자 가입 신청 · 승인해 주세요', n: joinWait, href: '/admin/settings#admins', tone: 'text-amber-700' },
    payOverdue.length > 0 && { key: 'vpay-overdue', icon: 'card' as const, text: '외주 대금 지급일 지남', n: payOverdue.length, href: '/admin/vendors?tab=pay', tone: 'text-rose-600', unit: '건' },
    paySoon.length > 0 && { key: 'vpay-soon', icon: 'card' as const, text: '외주 대금 3일 안 지급', n: paySoon.length, href: '/admin/vendors?tab=pay', tone: 'text-amber-700', unit: '건' },
    paidNoInvoice.length > 0 && { key: 'vpay-invoice', icon: 'receipt' as const, text: '지급했는데 세금계산서 안 받음', n: paidNoInvoice.length, href: '/admin/vendors?tab=pay&show=paid', tone: 'text-amber-700', unit: '건' },
    quoteDue.length > 0 && {
      key: 'quote-due',
      icon: 'file' as const,
      text: quoteDue.length === 1 ? `견적 마감 · 비교하고 선정 · ${quoteDue[0].title}` : '견적 마감 · 비교하고 선정',
      n: quoteDue.length,
      href: quoteDue.length === 1 ? `/admin/vendors/requests/${quoteDue[0].id}` : '/admin/vendors?tab=quotes',
      tone: 'text-brand-700',
      unit: '건',
    },
  ] as (Todo | false)[]).filter((t): t is Todo => !!t)
  const group = group0
  const todos: Todo[] = [
    // 새 문의 (따로 띄우던 띠를 할 일 맨 위로)
    ...(unreadChats > 0 ? [{ key: 'chat', icon: 'chat' as const, text: '새 문의 · 답장해 주세요', n: unreadChats, unit: '건', href: '/admin/chat', tone: 'text-rose-600' }] : []),
    ...group(arriveMsgs.filter((m) => !arrived.has(`${m.job_id}|${m.thread_user_id}`)), (m) => m.job_id).map((g) => ({
      key: `arrive-${g[0].job_id}`,
      icon: 'pin' as const,
      text: `출근 확인 요청 · ${titleOf.get(g[0].job_id) ?? '공고'}`,
      n: new Set(g.map((m) => m.thread_user_id)).size,
      href: `/admin/jobs/${g[0].job_id}?tab=att&date=${today}`,
      tone: 'text-brand-700',
    })),
    ...group(fixWait, (m) => m.job_id).map((g) => ({
      key: `fix-${g[0].job_id}`,
      icon: 'pen' as const,
      // 일찍 끝났지만 근로조건대로 인정해 달라는 요청은 '시간 인정 요청'으로
      text: `${g.every((m) => isFullTimeAsk(m.body)) ? '시간 인정 요청' : g.some((m) => isFullTimeAsk(m.body)) ? '정정·시간 인정 요청' : '기록 정정 요청'} · ${titleOf.get(g[0].job_id) ?? '공고'}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=att&date=${today}`,
      tone: 'text-violet-700',
    })),
    ...group(unsignedTomorrow, (a) => a.job_id).map((g) => ({
      key: `unsigned-${g[0].job_id}`,
      icon: 'pen' as const,
      text: `내일 근무 · 서명 안 함 · ${titleOf.get(g[0].job_id) ?? '공고'}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=docs`,
      tone: 'text-amber-700',
    })),
    ...group(otAsk, (a) => `${a.job_id}|${a.work_date}`).map((g) => ({
      key: `ot-${g[0].job_id}-${g[0].work_date}`,
      icon: 'clock' as const,
      text: `연장 근무 확인 요청 · ${g[0].job?.title ?? titleOf.get(g[0].job_id) ?? '공고'} ${fmtDate(g[0].work_date)}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=att&date=${g[0].work_date}`,
      tone: 'text-amber-700',
    })),
    ...group(openOld, (a) => `${a.job_id}|${a.work_date}`).map((g) => ({
      key: `open-${g[0].job_id}-${g[0].work_date}`,
      icon: 'flag' as const,
      text: `근무 종료 안 누름 · ${g[0].job?.title ?? titleOf.get(g[0].job_id) ?? '공고'} ${fmtDate(g[0].work_date)}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=att&date=${g[0].work_date}`,
      tone: 'text-rose-600',
    })),
    ...group(shiftWait, (c) => c.job_id).map((g) => {
      const date = g.find((c) => c.work_date)?.work_date
      return {
        key: `shift-${g[0].job_id}`,
        icon: 'clock' as const,
        text: `근무시간 변경 답 기다림 · ${titleOf.get(g[0].job_id) ?? '공고'}`,
        n: g.length,
        href: `/admin/jobs/${g[0].job_id}?tab=att${date ? `&date=${date}` : ''}`,
        tone: 'text-brand-700',
      }
    }),
    ...group(outsideApps, (a) => a.job_id).map((g) => ({
      key: `contract-${g[0].job_id}`,
      icon: 'file' as const,
      text: `${contractNameOf(activeJobs.find((j) => j.id === g[0].job_id)?.audience)} 미수령 · ${titleOf.get(g[0].job_id) ?? '공고'}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=docs`,
      tone: 'text-rose-600',
    })),
    ...Object.entries(unpaid).map(([id, u]) => ({
      key: `unpaid-${id}`,
      icon: 'card' as const,
      text: `급여 지급 전 · ${u.title}`,
      n: u.n,
      href: `/admin/jobs/${id}?tab=pay`,
      tone: 'text-amber-700',
    })),
    ...vendorTodos,
  ]
  const pendingApps = pending.filter((p) => p.job && p.job.end_date >= today)
  // 모집 인원이 이미 다 찬 공고의 지원자는 확정할 때 한 번 더 물어봄
  const headOf = new Map(activeJobs.map((j) => [j.id, j.headcount]))
  const isFull = (jobId: string) => (counts[jobId] ?? 0) >= (headOf.get(jobId) ?? Infinity)
  // 추가 근로 → 주휴수당 (관리자에게만): 확정하면 같은 회사 다른 공고와 합쳐 한 주 15시간을 넘는 지원자
  const weeklyOf = new Map<string, WeekImpact>()
  await Promise.all(
    [...new Set(pendingApps.map((p) => p.job.id))].map(async (jid) => {
      const job = activeJobs.find((j) => j.id === jid)
      if (!job) return
      const m = await weeklyImpact(
        job,
        pendingApps.filter((p) => p.job.id === jid).map((p) => ({ user_id: p.user.id, status: 'applied', available_dates: p.available_dates })),
      ).catch(() => new Map<string, WeekImpact>())
      for (const [uid, w] of m) if (w.kind === 'becomes') weeklyOf.set(`${jid}|${uid}`, w)
    }),
  )
  const weeklyFor = (p: (typeof pendingApps)[number]) => weeklyOf.get(`${p.job.id}|${p.user.id}`)
  const confirmText = (p: (typeof pendingApps)[number]) => (isFull(p.job.id) ? '인원 다 찼어요 · 확정?' : weeklyFor(p) ? '주휴 대상이 돼요 · 확정?' : null)
  const WeeklyNote = ({ p }: { p: (typeof pendingApps)[number] }) => {
    const w = weeklyFor(p)
    if (!w) return null
    return (
      <Link
        href={`/admin/weekly?w=${w.weekStart}`}
        title={`${hoursText(w.before)} → ${hoursText(w.after)}`}
        className="inline-block max-w-full truncate rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
        data-weekly-impact="becomes"
      >
        확정하면 주휴 대상 · 약 {won(w.amount)}
      </Link>
    )
  }
  // 확정 대기 지원자: 5명까지 바로, 나머지는 '더보기'
  const PENDING_SHOW = 5
  // 여러 명 골라 한 번에 확정·미선발 (공고가 달라도) · 공고별 남은 자리와 주휴 대상은 확정 전에 한 번 더
  const pickBox = (p: (typeof pendingApps)[number]) =>
    pendingApps.length > 1 ? (
      <label className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg active:bg-bg" aria-label={`${p.user.name} 고르기`}>
        <input
          type="checkbox"
          name="app"
          value={p.id}
          form={BULK_FORM}
          data-job={p.job.id}
          data-left={headOf.has(p.job.id) ? Math.max(0, headOf.get(p.job.id)! - (counts[p.job.id] ?? 0)) : undefined}
          data-warn={weeklyFor(p) ? '주휴 대상' : undefined}
          className="size-5 accent-brand-600"
        />
      </label>
    ) : null
  const pendingFirst = pendingApps.slice(0, PENDING_SHOW)
  const pendingRest = pendingApps.slice(PENDING_SHOW)
  const pendingCard = (p: (typeof pendingApps)[number]) => (
    <div key={p.id} className="card space-y-2.5 p-4 transition-shadow duration-200 has-checked:ring-2 has-checked:ring-brand-400">
      <div className="flex items-center gap-3">
        {pickBox(p)}
        <Avatar id={p.user.id} name={p.user.name} photoAt={p.user.photo_at} size="lg" />
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1.5">
          <Link href={`/admin/workers/${p.user.id}`} className="text-[17px] font-bold">
            {p.user.name}
          </Link>
          {p.user.birth_date && <span className="text-sm text-mute">만 {ageOn(p.user.birth_date)}세</span>}
          <span className="ml-auto text-xs text-mute">{kstDateTime(p.created_at)}</span>
        </div>
      </div>
      <Link href={`/admin/jobs/${p.job.id}?tab=apps`} className="block truncate text-sm font-semibold text-sub">
        <Icon name="pin" className="text-mute" /> {p.job.title}
      </Link>
      {(p.available_dates || p.message) && (
        <div className="rounded-xl bg-bg px-3 py-2 text-sm text-sub">
          {p.available_dates && <p>가능일 {p.available_dates.map(fmtDate).join(', ')}</p>}
          {p.message && <p>“{p.message}”</p>}
        </div>
      )}
      <WeeklyNote p={p} />
      <ContactButtons phone={p.user.phone} name={p.user.name} />
      <div className="grid grid-cols-3 gap-2">
        <form action={decideApplication.bind(null, p.id, 'approved', 'dashboard')}>
          {confirmText(p) ? (
            <ConfirmSubmit className="btn-primary w-full" confirmText={confirmText(p)!}>
              확정
            </ConfirmSubmit>
          ) : (
            <SubmitButton className="btn-primary w-full" pendingText="확정 중…">
              확정
            </SubmitButton>
          )}
        </form>
        {/* 보류: 근무자에게 알림 없이 따로 (공고의 지원자 탭 '보류'로) */}
        <form action={holdApplication.bind(null, p.id, true, 'dashboard')}>
          <SubmitButton className="btn-gray w-full" pendingText="…" track="보류(대시보드)">
            보류
          </SubmitButton>
        </form>
        <form action={decideApplication.bind(null, p.id, 'rejected', 'dashboard')}>
          {/* 미선발로 정하면 근무자에게 결과 알림이 가므로 한 번 더 확인 */}
          <ConfirmSubmit className="btn-gray w-full" confirmText="미선발 알림?">
            미선발
          </ConfirmSubmit>
        </form>
      </div>
    </div>
  )
  const pendingRow = (p: (typeof pendingApps)[number]) => (
    <tr key={p.id} className="[&:has(:checked)>td]:bg-brand-50">
      <td className="whitespace-nowrap">
        <span className="mr-1 inline-block align-middle">{pickBox(p)}</span>
        <span className="mr-2 inline-block align-middle">
          <Avatar id={p.user.id} name={p.user.name} photoAt={p.user.photo_at} size="sm" />
        </span>
        <Link href={`/admin/workers/${p.user.id}`} className="font-semibold">
          {p.user.name}
        </Link>
        {p.user.birth_date && <span className="ml-1 text-xs text-mute">만 {ageOn(p.user.birth_date)}세</span>}
        <div className="mt-1">
          <ContactButtons phone={p.user.phone} name={p.user.name} />
        </div>
      </td>
      <td>
        <Link href={`/admin/jobs/${p.job.id}?tab=apps`} className="font-medium">
          {p.job.title}
        </Link>
        <div className="mt-1 max-w-xs">
          <WeeklyNote p={p} />
        </div>
      </td>
      <td className="max-w-xs text-xs text-sub">
        {p.available_dates?.map(fmtDate).join(', ')}
        {p.message && <div>“{p.message}”</div>}
      </td>
      <td className="text-xs whitespace-nowrap text-mute">{kstDateTime(p.created_at)}</td>
      <td className="whitespace-nowrap">
        <div className="flex gap-1">
          <form action={decideApplication.bind(null, p.id, 'approved', 'dashboard')}>
            {confirmText(p) ? (
              <ConfirmSubmit className="btn-primary btn-sm" confirmText={confirmText(p)!}>
                확정
              </ConfirmSubmit>
            ) : (
              <SubmitButton className="btn-primary btn-sm" pendingText="…">
                확정
              </SubmitButton>
            )}
          </form>
          <form action={decideApplication.bind(null, p.id, 'rejected', 'dashboard')}>
            <ConfirmSubmit className="btn-gray btn-sm" confirmText="미선발 알림 보낼까요?">
              미선발
            </ConfirmSubmit>
          </form>
        </div>
      </td>
    </tr>
  )
  // 계약서에 들어가는 회사 정보 (회사 설정 맨 위 체크 목록과 같은 4가지)
  const firstEmpty = missingSetup(settings, sealSet)[0]
  // 회사 설정의 첫 빈 칸으로 바로 (커서까지). 빈 칸이 있으면 '시작하기'의 '회사 정보 채우기'가 남아 있음
  const setupHref = `/admin/settings${firstEmpty ? `#${firstEmpty.key}` : ''}`
  // 새 회사가 처음 할 일 (필수 3가지를 마치면 사라짐, 관리자 초대는 대표 관리자에게만 · 선택)
  const startSteps = [
    { key: 'info', done: !firstEmpty, title: '회사 정보 채우기', desc: '직인·주소 등 계약서에 들어가요', href: setupHref, optional: false },
    { key: 'job', done: jobsEver > 0, title: '첫 공고 올리기', desc: '시간·시급·장소만 넣으면 돼요', href: '/admin/jobs/new', optional: false },
    { key: 'share', done: appsEver > 0, title: '근무자 모으기', desc: '공고 모음 링크를 단톡방에', href: '/admin/jobs', optional: false },
    ...(isOwner ? [{ key: 'team', done: memberCount > 1, title: '함께 일할 관리자 초대', desc: '초대 코드로 직원 초대 (선택)', href: '/admin/settings#admins', optional: true }] : []),
  ]
  const showStart = startSteps.some((st) => !st.optional && !st.done)
  // 첫 공고를 올렸는데 아직 지원이 없으면: 공고 모음 링크를 여기서 바로 복사·공유 (공고 화면까지 가지 않게)
  const shareNow = showStart && jobsEver > 0 && appsEver === 0
  const companyLink = shareNow ? `${await siteOrigin()}/?co=${admin.companyId}` : ''
  const startDone = startSteps.filter((st) => st.done).length
  // 공고를 한 번도 안 올린 새 회사: 0만 있는 숫자 칸과 '오늘 행사 없음'·'확정 대기 없음' 빈 칸은 빼고 '시작하기'에 집중
  // (같은 '아직 없어요'를 여러 번 보여 주지 않게 · 공고 칸의 '새 공고 등록' 하나만 남김)
  const fresh = jobsEver === 0

  return (
    <div className="space-y-5">
      <Flash m={sp.m} />
      {/* 휴대폰 관리자도 앱으로 설치 (누르면 바로 설치 창 · 이미 앱이면 안 보임) */}
      <InstallBanner />
      {/* 직접 가입해 확인 전인 회사: 무엇이 되고 무엇이 확인 뒤에 열리는지 */}
      {!admin.companyVerified && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200/70">
          <p className="font-bold">🔒 회사 확인 중이에요</p>
          <p className="mt-1">
            공고 올리기·지원자 확정·서류·출퇴근·정산은 지금 바로 쓸 수 있어요. 다른 회사에 지원한 사람까지 보이는 <b>해피워크 전체 회원 명단</b>과 번호로 직접 추가는 확인을 마친 뒤에 열려요.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold">{fmtDate(today)} 현황</h1>
          <AutoRefresh />
        </div>
        <Link href="/admin/jobs/new" className="btn-primary">
          + 새 공고 등록
        </Link>
      </div>
      {/* 새 소식 한 줄 (회사마다 바뀐 규칙 알리기 · 닫으면 다시 안 보임 · 이달 말까지) */}
      {today <= '2026-11-30' && !fresh && (
        <NewsNote id="weekly-pay-2026-11" href="/admin/weekly">
          주휴수당이 정산에 자동으로 들어가요 ›
        </NewsNote>
      )}
      {/* 한 계정으로 두 역할: 다른 회사에서 오늘 내 근무 → 근무자 화면 '내 근무'로 바로 (출근·종료는 거기서) */}
      {myShift && (
        <a href="/api/view?to=worker&next=/me" className="card-link flex animate-pop items-center gap-3 p-3.5 ring-emerald-200/80" data-my-shift>
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-lg text-emerald-600">
            <Icon name="clock" />
          </span>
          {/* 세 줄: 언제(근무 중) · 무슨 일 · 어느 회사 (360px에서 회사 이름이 잘리지 않게 따로) */}
          <span className="min-w-0 flex-1 leading-snug">
            <span className="block truncate text-xs font-bold text-emerald-700">
              {myShift.working ? `내 근무 중 · ${hhmm(myShift.job.end_time)}까지` : `오늘 내 근무 · ${hhmm(myShift.job.start_time)} 시작`}
            </span>
            <b className="block truncate">{myShift.job.title}</b>
            {myShift.job.company?.company_name && <span className="block truncate text-xs text-sub">{myShift.job.company.company_name}</span>}
          </span>
          <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap text-white ${myShift.working ? 'bg-rose-500' : 'bg-emerald-600'}`}>
            {myShift.working ? '근무 종료' : '출근하기'}
          </span>
        </a>
      )}
      {otherUnread.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm" data-other-companies>
          <span className="font-semibold text-brand-700">
            <Icon name="building" /> 다른 회사에 새 문의
          </span>
          {otherUnread.map((c) => (
            <form key={c.id} action={switchCompany}>
              <input type="hidden" name="company" value={c.id} />
              <SubmitButton className="chip max-w-[14rem]" pendingText="바꾸는 중…" track="다른 회사 문의로 바꾸기">
                <span className="min-w-0 truncate">{c.name}</span>
                <b className="text-rose-600">{c.n}</b>
              </SubmitButton>
            </form>
          ))}
        </div>
      )}
      {todos.length > 0 && (
        <section className="card animate-pop space-y-2 p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <Icon name="check" className="text-brand-600" />
            확인할 일
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{todos.reduce((t, x) => t + x.n, 0)}</span>
          </h2>
          <ul className="divide-y divide-line">
            {todos.map((t) => (
              <li key={t.key}>
                <Link href={t.href} className="flex items-center gap-3 py-2.5 text-sm transition active:scale-[0.99]">
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-bg text-[17px] text-sub">
                    <Icon name={t.icon} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t.text}</span>
                  <b className={`shrink-0 ${t.tone}`}>
                    {t.n}
                    {t.unit ?? '명'}
                  </b>
                  <span aria-hidden className="shrink-0 text-mute">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* 인원이 모자란 공고: 흰 카드 + 작은 빨간 점 · 공고마다 한 줄 (사용자 요청 '디자인 더 깔끔하게') */}
      {short.length > 0 && (
        <section className="card animate-pop space-y-1" data-shortage>
          <h2 className="flex items-center gap-2 font-bold">
            {/* 이미 시작한 행사만 남았으면 '곧 시작하는데'가 맞지 않음 */}
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-rose-500" /> {short.every(begun) ? '진행 중인데 인원이 모자라요' : '곧 시작하는데 인원이 모자라요'}
          </h2>
          {/* 처음 모집하는 회사만 짧은 안내 (알릴 예전 근무자가 없어서) */}
          {appsEver === 0 && <p className="text-sm text-sub">아직 지원자가 없어요. 공고 모음 링크를 단톡방에 올리거나 QR을 붙여 모집을 알려 보세요.</p>}
          <ul className="divide-y divide-line">
            {short.map((j) => {
              const gap = j.headcount - (counts[j.id] ?? 0)
              const wait = waitingBy[j.id] ?? 0
              const when = begun(j) ? '진행 중 ·' : j.start_date === today ? '오늘' : j.start_date === tomorrow ? '내일' : fmtDate(j.start_date)
              return (
                <li key={j.id} className="space-y-1.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/jobs/${j.id}?tab=apps`} className="min-w-0 flex-1 truncate font-semibold">
                      {j.title}
                    </Link>
                    <span className="shrink-0 text-sm font-bold text-rose-600">{gap}명 부족</span>
                  </div>
                  <p className="text-xs text-sub">
                    {when} {hhmm(j.start_time)} 시작 · 확정 {counts[j.id] ?? 0}/{j.headcount}명 · 대기 {wait}명
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {wait === 0 && appsEver === 0 ? (
                      // 처음 모집하는 회사: 알릴 예전 근무자가 없으니 공고 모음 링크·QR로
                      <Link href="/admin/jobs/poster" className="chip-primary h-8" data-short-share>
                        공고 링크·QR로 알리기
                      </Link>
                    ) : (
                      <Link href={`/admin/jobs/${j.id}?tab=apps`} className="chip-primary h-8">
                        {wait > 0 ? `대기 ${wait}명 확정하러 가기` : '예전 근무자에게 알리기'}
                      </Link>
                    )}
                    {j.status === 'closed' && (
                      <form action={setJobStatus.bind(null, j.id, 'open')}>
                        <SubmitButton className="chip h-8" pendingText="여는 중…">
                          모집 다시 열기
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {/* 새 회사: 무엇부터 하면 되는지 (다 하면 사라짐) */}
      {showStart && (
        <section className="card space-y-3 p-4" data-start-steps>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">🚀 해피워크 시작하기</h2>
            <span className="shrink-0 text-sm font-bold text-brand-600">
              {startDone}/{startSteps.length}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg">
            <div className="h-full origin-left animate-grow rounded-full bg-brand-500" style={{ width: `${Math.round((startDone / startSteps.length) * 100)}%` }} />
          </div>
          <ol className="divide-y divide-line">
            {startSteps.map((st, i) => {
              // 아직 안 한 첫 단계 = 지금 할 일 (연한 바탕 + 진한 번호로 어디부터 하면 되는지 바로 보이게)
              const next = !st.done && startSteps.findIndex((x) => !x.done) === i
              return (
              <li key={st.key}>
                <Link
                  href={st.href}
                  className={`flex items-center gap-3 py-2.5 transition active:scale-[0.99] ${next ? '-mx-2 my-1 rounded-xl bg-brand-50/70 px-2 ring-1 ring-brand-100' : ''}`}
                  data-done={st.done ? '1' : undefined}
                  data-next-step={next ? '' : undefined}
                >
                  <span
                    aria-hidden
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${st.done ? 'bg-emerald-500 text-white' : next ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}
                  >
                    {st.done ? '✓' : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-bold ${st.done ? 'text-mute line-through' : ''}`}>{st.title}</span>
                    <span className="block truncate text-xs text-sub">{st.done ? '완료' : st.desc}</span>
                  </span>
                  {next ? (
                    <span className="shrink-0 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white">지금 하기</span>
                  ) : (
                    !st.done && (
                      <span aria-hidden className="shrink-0 text-mute">
                        ›
                      </span>
                    )
                  )}
                </Link>
              </li>
              )
            })}
          </ol>
          {shareNow && (
            <div className="space-y-2.5 rounded-2xl bg-brand-50 px-3.5 py-3" data-start-share>
              <p>
                <b className="block text-sm">공고 모음 링크를 단톡방에 올려 주세요</b>
                <span className="block text-xs text-sub">근무자가 이 링크로 보고 바로 지원해요</span>
              </p>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                <CopyButton text={companyLink} label="링크 복사" className="btn-gray btn-sm" />
                <ShareButton title={`${admin.companyName} 모집 공고`} text={`${admin.companyName} 모집 공고 모음`} path={`/?co=${admin.companyId}`} className="btn-primary btn-sm" />
                {/* 현장·게시판에 붙일 인쇄용 QR */}
                <Link href="/admin/jobs/poster" className="btn-gray btn-sm" data-start-qr>
                  QR
                </Link>
              </div>
            </div>
          )}
        </section>
      )}
      {!fresh && (
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4" data-dash-stats>
        <Stat label="지금 근무 중" value={working.length} href="/admin/jobs" icon="working" tone="bg-emerald-50 text-emerald-600" />
        <Stat label="확정 대기 지원" value={pendingApps.length} href="#pending" icon="pending" tone="bg-amber-50 text-amber-600" />
        <Stat label="서명 대기 서류" value={pendingDocs.count ?? 0} href="/admin/jobs" icon="docs" tone="bg-brand-50 text-brand-600" />
        <Stat label={admin.companyVerified ? '가입 근무자' : '우리 지원자'} value={workerCount.count ?? 0} href="/admin/workers" icon="people" tone="bg-gray-100 text-sub" />
      </div>
      )}

      {!fresh && (
      <section>
        <h2 className="section-title">오늘 진행 행사</h2>
        {todayJobs.length === 0 ? (
          <Empty icon="🗓️" title="오늘 진행하는 행사가 없어요">
            <Link href="/admin/jobs" className="font-semibold text-brand-600">
              공고 보기 →
            </Link>
          </Empty>
        ) : (
          <div className="stagger grid gap-3 md:grid-cols-2">
            {todayJobs.map((j) => (
              <div key={j.id} className="card space-y-3" data-today-job>
                <Link href={`/admin/jobs/${j.id}?tab=att&date=${today}`} className="block transition active:scale-[0.99]">
                <p className="font-bold">{j.title}</p>
                <p className="text-sm text-sub">
                  {scheduleText(j)}
                  {j.location_name && ` · ${j.location_name}`}
                </p>
                <p className="mt-3 flex items-baseline justify-between gap-2 text-sm">
                  {!started(j) && !(workingBy[j.id] ?? 0) ? (
                    // 시작 전: '근무 중 0명' 대신 시작 시각과 남은 시간 (30초마다 줄어듦)
                    // 시작 시각은 굵게 한 줄 · 남은 시간은 아래 작은 줄 (한 줄로 이으면 오른쪽 '확정·모집'까지 두 줄로 꺾임)
                    <span className="min-w-0 font-bold text-brand-600" data-today-before>
                      {hhmm(j.start_time)} 시작
                      <StartsIn startAt={kstAt(today, j.start_time).toISOString()} serverNow={Date.now()} />
                    </span>
                  ) : (
                  <span className="font-bold text-emerald-600">
                    근무 중 <LiveNumber value={workingBy[j.id] ?? 0} />명
                    {started(j) && (absentBy[j.id] ?? 0) > 0 && (
                      <span className="ml-2 text-rose-600">
                        미출근 <LiveNumber value={absentBy[j.id]} />명
                      </span>
                    )}
                  </span>
                  )}
                  <span className="shrink-0 text-mute">
                    확정 {counts[j.id] ?? 0}명 · 모집 {j.headcount}명
                  </span>
                </p>
                <SlotBar value={workingBy[j.id] ?? 0} max={counts[j.id] ?? 0} color="bg-emerald-500" className="mt-2" />
                </Link>
                {/* 지금 할 일 큰 버튼 (출석 체크 · 오늘 근무 마무리 · 행사 종료하기) */}
                <JobActions job={j} today={today} working={workingBy[j.id] ?? 0} compact />
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {!fresh && (
      <section id="pending">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="section-title mb-0">
            확정 대기 지원자{pendingApps.length > 0 && <span className="ml-1.5 text-brand-600 tabular-nums">{pendingApps.length}</span>}
          </h2>
          {/* 여러 명을 한 번에: 보이는 지원자를 모두 고른 뒤 아래 막대에서 확정·미선발 */}
          {pendingApps.length > 1 && <PickAll label="모두 고르기" />}
        </div>
        {pendingApps.length === 0 ? (
          <Empty icon="📭" title="확정을 기다리는 지원자가 없어요">
            <Link href="/admin/jobs" className="font-semibold text-brand-600">
              공고 모음 링크 공유하기 →
            </Link>
          </Empty>
        ) : (
          <>
            {/* 휴대폰: 카드 (확정·미선발 버튼까지 옆으로 밀지 않고 바로) */}
            <div className="stagger space-y-2 sm:hidden">{pendingFirst.map(pendingCard)}</div>

            <div className="card hidden overflow-x-auto p-0 sm:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>지원자</th>
                    <th>공고</th>
                    <th>가능일 · 한마디</th>
                    <th>지원 시각</th>
                    <th />
                  </tr>
                </thead>
                <tbody>{pendingFirst.map(pendingRow)}</tbody>
              </table>
            </div>
            {/* 5명이 넘으면 나머지는 접어 둠 (대시보드가 길어지지 않게) */}
            {pendingRest.length > 0 && (
              <details className="group mt-2" data-pending-more>
                <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-sub ring-1 ring-line before:hidden [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">나머지 {pendingRest.length}명 더보기</span>
                  <span className="hidden group-open:inline">접기</span>
                  <svg viewBox="0 0 24 24" className="size-4 text-mute transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <div className="mt-2 space-y-2 sm:hidden">{pendingRest.map(pendingCard)}</div>
                <div className="card mt-2 hidden overflow-x-auto p-0 sm:block">
                  <table className="table">
                    <tbody>{pendingRest.map(pendingRow)}</tbody>
                  </table>
                </div>
              </details>
            )}
            {/* 감싸지 않고 바로 (감싸면 막대가 화면 아래에 붙지 못함) */}
            {pendingApps.length > 1 && (
              <BulkApproveBar className="mt-2" approve={decideSelected.bind(null, 'dashboard', 'approved')} reject={decideSelected.bind(null, 'dashboard', 'rejected')} />
            )}
          </>
        )}
      </section>
      )}

      <section>
        <h2 className="section-title">진행·예정 공고</h2>
        {activeJobs.length === 0 && (
          <div data-dash-jobs-empty>
            <Empty icon="📋" title="진행 중인 공고가 없어요">
              <p>시간·시급·장소만 넣으면 바로 모집을 시작해요.</p>
              <Link href="/admin/jobs/new" className="btn-primary btn-sm mt-3 inline-flex">
                + 새 공고 등록
              </Link>
            </Empty>
          </div>
        )}
        <div className="stagger grid gap-3 md:grid-cols-2">
          {activeJobs.map((j) => (
            <Link key={j.id} href={`/admin/jobs/${j.id}`} className="card-link block">
              <p className="font-bold">{j.title}</p>
              <p className="text-sm text-sub">
                {fmtDateRange(j.start_date, j.end_date)} {scheduleText(j)}
              </p>
              <p className="mt-1 text-sm">
                확정 <b>{counts[j.id] ?? 0}</b>/{j.headcount}명
                {j.status === 'closed' && <span className="badge ml-2 bg-gray-100 text-mute">모집마감</span>}
              </p>
              <SlotBar value={counts[j.id] ?? 0} max={j.headcount} className="mt-2" />
            </Link>
          ))}
        </div>
      </section>

      {/* 근무자 후기 (급한 일이 아니라 맨 아래): 평균 별점 + 최근 2개 (실제로 일한 근무자가 별명으로 남긴 것) */}
      {reviews && reviews.count > 0 && (
        <Link href={`/community/company/${admin.companyId}`} className="card-link block space-y-2.5 p-4" data-admin-reviews>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">⭐ 근무자 후기</h2>
            <span className="text-sm font-semibold text-brand-600">모두 보기 →</span>
          </div>
          <p className="flex items-baseline gap-2">
            <b className="text-2xl font-extrabold tabular-nums">{reviews.avg.toFixed(1)}</b>
            <span className="text-amber-500" aria-hidden>
              {'★'.repeat(Math.round(reviews.avg))}
              <span className="text-line">{'★'.repeat(5 - Math.round(reviews.avg))}</span>
            </span>
            <span className="text-sm text-mute">후기 {reviews.count}개</span>
          </p>
          <ul className="space-y-1.5">
            {reviews.recent.map((r) => (
              <li key={r.id} className="rounded-xl bg-bg px-3 py-2 text-sm">
                <p className="line-clamp-2">
                  <b className="text-amber-500">{'★'.repeat(r.rating)}</b> {r.body}
                </p>
                <p className="truncate text-xs text-mute">
                  {r.jobTitle} · {ago(r.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </Link>
      )}
      {/* 휴대폰 알림 켜기·상태 (맨 아래) */}
      <div className="card space-y-4 p-4" data-push-settings>
        <PushToggle publicKey={pushPublicKey()} admin />
        <PushLevel initial={await myPushLevel()} admin />
      </div>
    </div>
  )
}
