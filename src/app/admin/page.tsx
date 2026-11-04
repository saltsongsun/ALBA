import Link from 'next/link'
import { decideApplication, setJobStatus } from '@/app/actions/admin'
import { contractNameOf } from '@/lib/members'
import AutoRefresh from '@/components/AutoRefresh'
import Avatar from '@/components/Avatar'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import LiveNumber from '@/components/LiveNumber'
import PushToggle from '@/components/PushToggle'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { countApps, getSettings, hasSeal, JOB_WITH_APP_STATUS, unpaidByJob, unreadForAdmins, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { pendingFix, signalOf } from '@/lib/signals'
import { pushPublicKey } from '@/lib/push'
import { requireAdmin } from '@/lib/session'
import { ago, companyReviews } from '@/lib/community'
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
    <Link href={href} className="card-link block px-4 py-4 sm:px-5">
      <p className="truncate text-sm font-semibold whitespace-nowrap text-mute">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-3xl font-extrabold">
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

/** 비율 막대 (자동 갱신으로 값이 바뀌면 부드럽게 늘고 줄어듦) */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100))
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg">
      <div className={`h-full origin-left animate-grow rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
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
    db().from('users').select('id', { count: 'exact', head: true }).eq('role', 'worker').eq('active', true).neq('member_type', 'vendor'),
    unreadForAdmins(admin.companyId),
  ])
  const counts = countApps(activeJobs, 'approved')
  const waitingBy = countApps(activeJobs, 'applied')
  // 곧(모레까지) 시작하거나 진행 중인데 확정 인원이 모자란 행사: 취소로 빈자리가 생겼을 때 바로 보이게
  const soon = kstDate(new Date(Date.now() + 2 * 86_400_000))
  const tomorrow = kstDate(new Date(Date.now() + 86_400_000))
  const short = activeJobs.filter((j) => j.start_date <= soon && (counts[j.id] ?? 0) < j.headcount)
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
  type Todo = { key: string; icon: string; text: string; n: number; href: string; tone: string; unit?: string }
  const [vpays, vreqs, vquotes, joinWait, jobsEver, appsEver, memberCount] = await vendorP
  const reviews = await reviewsP
  const in3 = kstDate(new Date(Date.now() + 3 * 86_400_000))
  const payOverdue = vpays.filter((p) => !p.paid_at && p.due_date && p.due_date < today)
  const paySoon = vpays.filter((p) => !p.paid_at && p.due_date && p.due_date >= today && p.due_date <= in3)
  const paidNoInvoice = vpays.filter((p) => p.paid_at && !p.invoice_at)
  const quoteDue = vreqs.filter((r) => r.due_date && r.due_date <= today && vquotes.some((q) => q.request_id === r.id && q.amount != null))
  const vendorTodos: Todo[] = ([
    joinWait > 0 && { key: 'join', icon: '🧑‍💼', text: '관리자 가입 신청 · 승인해 주세요', n: joinWait, href: '/admin/settings#admins', tone: 'text-amber-700' },
    payOverdue.length > 0 && { key: 'vpay-overdue', icon: '💸', text: '외주 대금 지급일 지남', n: payOverdue.length, href: '/admin/vendors?tab=pay', tone: 'text-rose-600', unit: '건' },
    paySoon.length > 0 && { key: 'vpay-soon', icon: '💸', text: '외주 대금 3일 안 지급', n: paySoon.length, href: '/admin/vendors?tab=pay', tone: 'text-amber-700', unit: '건' },
    paidNoInvoice.length > 0 && { key: 'vpay-invoice', icon: '🧾', text: '지급했는데 세금계산서 안 받음', n: paidNoInvoice.length, href: '/admin/vendors?tab=pay&show=paid', tone: 'text-amber-700', unit: '건' },
    quoteDue.length > 0 && {
      key: 'quote-due',
      icon: '📄',
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
    ...(unreadChats > 0 ? [{ key: 'chat', icon: '💬', text: '새 문의 · 답장해 주세요', n: unreadChats, unit: '건', href: '/admin/chat', tone: 'text-rose-600' }] : []),
    ...group(arriveMsgs.filter((m) => !arrived.has(`${m.job_id}|${m.thread_user_id}`)), (m) => m.job_id).map((g) => ({
      key: `arrive-${g[0].job_id}`,
      icon: '📍',
      text: `출근 확인 요청 · ${titleOf.get(g[0].job_id) ?? '공고'}`,
      n: new Set(g.map((m) => m.thread_user_id)).size,
      href: `/admin/jobs/${g[0].job_id}?tab=att&date=${today}`,
      tone: 'text-brand-700',
    })),
    ...group(fixWait, (m) => m.job_id).map((g) => ({
      key: `fix-${g[0].job_id}`,
      icon: '✏️',
      text: `기록 정정 요청 · ${titleOf.get(g[0].job_id) ?? '공고'}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=att&date=${today}`,
      tone: 'text-violet-700',
    })),
    ...group(unsignedTomorrow, (a) => a.job_id).map((g) => ({
      key: `unsigned-${g[0].job_id}`,
      icon: '✍️',
      text: `내일 근무 · 서명 안 함 · ${titleOf.get(g[0].job_id) ?? '공고'}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=docs`,
      tone: 'text-amber-700',
    })),
    ...group(otAsk, (a) => `${a.job_id}|${a.work_date}`).map((g) => ({
      key: `ot-${g[0].job_id}-${g[0].work_date}`,
      icon: '⏱',
      text: `연장 근무 확인 요청 · ${g[0].job?.title ?? titleOf.get(g[0].job_id) ?? '공고'} ${fmtDate(g[0].work_date)}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=att&date=${g[0].work_date}`,
      tone: 'text-amber-700',
    })),
    ...group(openOld, (a) => `${a.job_id}|${a.work_date}`).map((g) => ({
      key: `open-${g[0].job_id}-${g[0].work_date}`,
      icon: '🏁',
      text: `근무 종료 안 누름 · ${g[0].job?.title ?? titleOf.get(g[0].job_id) ?? '공고'} ${fmtDate(g[0].work_date)}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=att&date=${g[0].work_date}`,
      tone: 'text-rose-600',
    })),
    ...group(shiftWait, (c) => c.job_id).map((g) => {
      const date = g.find((c) => c.work_date)?.work_date
      return {
        key: `shift-${g[0].job_id}`,
        icon: '🕒',
        text: `근무시간 변경 답 기다림 · ${titleOf.get(g[0].job_id) ?? '공고'}`,
        n: g.length,
        href: `/admin/jobs/${g[0].job_id}?tab=att${date ? `&date=${date}` : ''}`,
        tone: 'text-brand-700',
      }
    }),
    ...group(outsideApps, (a) => a.job_id).map((g) => ({
      key: `contract-${g[0].job_id}`,
      icon: '📝',
      text: `${contractNameOf(activeJobs.find((j) => j.id === g[0].job_id)?.audience)} 미수령 · ${titleOf.get(g[0].job_id) ?? '공고'}`,
      n: g.length,
      href: `/admin/jobs/${g[0].job_id}?tab=docs`,
      tone: 'text-rose-600',
    })),
    ...Object.entries(unpaid).map(([id, u]) => ({
      key: `unpaid-${id}`,
      icon: '💰',
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
  const setupTodo = [
    !settings.business_no && '사업자등록번호',
    !settings.company_address && '회사 주소',
    !sealSet && '직인 이미지',
    !settings.contact_phone && '문의 연락처',
  ].filter(Boolean)
  // 새 회사가 처음 할 일 (필수 3가지를 마치면 사라짐, 관리자 초대는 대표 관리자에게만 · 선택)
  const startSteps = [
    { key: 'info', done: setupTodo.length === 0, title: '회사 정보 채우기', desc: '직인·주소 등 계약서에 들어가요', href: '/admin/settings', optional: false },
    { key: 'job', done: jobsEver > 0, title: '첫 공고 올리기', desc: '시간·시급·장소만 넣으면 돼요', href: '/admin/jobs/new', optional: false },
    { key: 'share', done: appsEver > 0, title: '근무자 모으기', desc: '공고 모음 링크를 단톡방에', href: '/admin/jobs', optional: false },
    ...(isOwner ? [{ key: 'team', done: memberCount > 1, title: '함께 일할 관리자 초대', desc: '초대 코드로 직원 초대 (선택)', href: '/admin/settings#admins', optional: true }] : []),
  ]
  const showStart = startSteps.some((st) => !st.optional && !st.done)
  const startDone = startSteps.filter((st) => st.done).length

  return (
    <div className="space-y-6">
      <Flash m={sp.m} />
      {/* 직접 가입해 확인 전인 회사: 무엇이 되고 무엇이 확인 뒤에 열리는지 */}
      {!admin.companyVerified && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
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
      {todos.length > 0 && (
        <section className="card animate-pop space-y-2 p-4">
          <h2 className="flex items-center gap-2 font-bold">
            ✅ 확인할 일
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{todos.reduce((t, x) => t + x.n, 0)}</span>
          </h2>
          <ul className="divide-y divide-line">
            {todos.map((t) => (
              <li key={t.key}>
                <Link href={t.href} className="flex items-center gap-3 py-2.5 text-sm transition active:scale-[0.99]">
                  <span aria-hidden className="text-lg">
                    {t.icon}
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
      {short.length > 0 && (
        <section className="card animate-pop space-y-3 border-2 border-rose-200 bg-rose-50/40">
          <div>
            <h2 className="font-bold">🚨 곧 시작하는데 인원이 모자라요</h2>
            <p className="text-sm text-sub">취소나 미확정으로 빈자리가 있어요. 대기자를 확정하거나 예전 근무자에게 모집을 알려 보세요.</p>
          </div>
          {short.map((j) => {
            const gap = j.headcount - (counts[j.id] ?? 0)
            const wait = waitingBy[j.id] ?? 0
            const when = j.start_date < today ? '진행 중' : j.start_date === today ? '오늘' : j.start_date === tomorrow ? '내일' : fmtDate(j.start_date)
            return (
              <div key={j.id} className="space-y-2 rounded-xl bg-white p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/jobs/${j.id}?tab=apps`} className="min-w-0 font-bold">
                    {j.title}
                  </Link>
                  <span className="badge shrink-0 bg-rose-600 text-white">{gap}명 부족</span>
                </div>
                <p className="text-sm text-sub">
                  <b className="text-ink">{when}</b> {hhmm(j.start_time)} 시작 · 확정 {counts[j.id] ?? 0}/{j.headcount}명 · 대기 {wait}명
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/admin/jobs/${j.id}?tab=apps`} className="chip-primary">
                    {wait > 0 ? `대기 ${wait}명 확정하러 가기` : '예전 근무자에게 알리기'}
                  </Link>
                  {j.status === 'closed' && (
                    <form action={setJobStatus.bind(null, j.id, 'open')}>
                      <SubmitButton className="chip" pendingText="여는 중…">
                        모집 다시 열기
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            )
          })}
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
            {startSteps.map((st, i) => (
              <li key={st.key}>
                <Link href={st.href} className="flex items-center gap-3 py-2.5 transition active:scale-[0.99]" data-done={st.done ? '1' : undefined}>
                  <span
                    aria-hidden
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${st.done ? 'bg-emerald-500 text-white' : 'bg-brand-50 text-brand-700'}`}
                  >
                    {st.done ? '✓' : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-bold ${st.done ? 'text-mute line-through' : ''}`}>{st.title}</span>
                    <span className="block truncate text-xs text-sub">{st.done ? '완료' : st.desc}</span>
                  </span>
                  {!st.done && (
                    <span aria-hidden className="shrink-0 text-mute">
                      ›
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!showStart && setupTodo.length > 0 && (
        <Link href="/admin/settings" className="block rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <b>회사 설정을 마무리해 주세요:</b> {setupTodo.join(', ')} — 근로계약서·임금명세서에 들어갑니다. →
        </Link>
      )}
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="지금 근무 중" value={working.length} href="/admin/jobs" icon="working" tone="bg-emerald-50 text-emerald-600" />
        <Stat label="확정 대기 지원" value={pendingApps.length} href="#pending" icon="pending" tone="bg-amber-50 text-amber-600" />
        <Stat label="서명 대기 서류" value={pendingDocs.count ?? 0} href="/admin/jobs" icon="docs" tone="bg-brand-50 text-brand-600" />
        <Stat label="가입 근무자" value={workerCount.count ?? 0} href="/admin/workers" icon="people" tone="bg-gray-100 text-sub" />
      </div>

      <section>
        <h2 className="section-title">오늘 진행 행사</h2>
        {todayJobs.length === 0 ? (
          <Empty icon="🗓️" title="오늘 진행하는 행사가 없습니다" />
        ) : (
          <div className="stagger grid gap-3 md:grid-cols-2">
            {todayJobs.map((j) => (
              <Link key={j.id} href={`/admin/jobs/${j.id}?tab=att&date=${today}`} className="card-link block">
                <p className="font-bold">{j.title}</p>
                <p className="text-sm text-sub">
                  {scheduleText(j)}
                  {j.location_name && ` · ${j.location_name}`}
                </p>
                <p className="mt-3 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-bold text-emerald-600">
                    근무 중 <LiveNumber value={workingBy[j.id] ?? 0} />명
                    {started(j) && (absentBy[j.id] ?? 0) > 0 && (
                      <span className="ml-2 text-rose-600">
                        미출근 <LiveNumber value={absentBy[j.id]} />명
                      </span>
                    )}
                  </span>
                  <span className="text-mute">
                    확정 {counts[j.id] ?? 0}명 · 모집 {j.headcount}명
                  </span>
                </p>
                <Bar value={workingBy[j.id] ?? 0} max={counts[j.id] ?? 0} color="bg-emerald-500" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="pending">
        <h2 className="section-title">확정 대기 지원자</h2>
        {pendingApps.length === 0 ? (
          <Empty icon="📭" title="대기 중인 지원이 없습니다" />
        ) : (
          <>
            {/* 휴대폰: 카드 (확정·미선발 버튼까지 옆으로 밀지 않고 바로) */}
            <div className="stagger space-y-2 sm:hidden">
              {pendingApps.map((p) => (
                <div key={p.id} className="card space-y-2.5 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar id={p.user.id} name={p.user.name} photoAt={p.user.photo_at} size="lg" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1.5">
                      <Link href={`/admin/workers/${p.user.id}`} className="text-[17px] font-bold">
                        {p.user.name}
                      </Link>
                      {p.user.birth_date && <span className="text-sm text-mute">만 {ageOn(p.user.birth_date)}세</span>}
                      <span className="ml-auto text-xs text-mute">{kstDateTime(p.created_at)}</span>
                    </div>
                  </div>
                  <Link href={`/admin/jobs/${p.job.id}?tab=apps`} className="block text-sm font-semibold text-sub">
                    📌 {p.job.title}
                  </Link>
                  {(p.available_dates || p.message) && (
                    <div className="rounded-xl bg-bg px-3 py-2 text-sm text-sub">
                      {p.available_dates && <p>가능일 {p.available_dates.map(fmtDate).join(', ')}</p>}
                      {p.message && <p>“{p.message}”</p>}
                    </div>
                  )}
                  <ContactButtons phone={p.user.phone} name={p.user.name} />
                  <div className="grid grid-cols-2 gap-2">
                    <form action={decideApplication.bind(null, p.id, 'approved')}>
                      {isFull(p.job.id) ? (
                        <ConfirmSubmit className="btn-primary w-full" confirmText="인원 다 찼어요 · 확정?">
                          확정
                        </ConfirmSubmit>
                      ) : (
                        <SubmitButton className="btn-primary w-full" pendingText="확정 중…">
                          확정
                        </SubmitButton>
                      )}
                    </form>
                    <form action={decideApplication.bind(null, p.id, 'rejected')}>
                      {/* 미선발로 정하면 근무자에게 결과 알림이 가므로 한 번 더 확인 */}
                      <ConfirmSubmit className="btn-gray w-full" confirmText="미선발 알림 보낼까요?">
                        미선발
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              ))}
            </div>

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
                <tbody>
                  {pendingApps.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">
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
                      </td>
                      <td className="max-w-xs text-xs text-sub">
                        {p.available_dates?.map(fmtDate).join(', ')}
                        {p.message && <div>“{p.message}”</div>}
                      </td>
                      <td className="text-xs whitespace-nowrap text-mute">{kstDateTime(p.created_at)}</td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1">
                          <form action={decideApplication.bind(null, p.id, 'approved')}>
                            {isFull(p.job.id) ? (
                              <ConfirmSubmit className="btn-primary btn-sm" confirmText="인원 다 찼어요 · 확정?">
                                확정
                              </ConfirmSubmit>
                            ) : (
                              <SubmitButton className="btn-primary btn-sm" pendingText="…">
                                확정
                              </SubmitButton>
                            )}
                          </form>
                          <form action={decideApplication.bind(null, p.id, 'rejected')}>
                            <ConfirmSubmit className="btn-gray btn-sm" confirmText="미선발 알림 보낼까요?">
                              미선발
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="section-title">진행·예정 공고</h2>
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
              <Bar value={counts[j.id] ?? 0} max={j.headcount} color="bg-brand-500" />
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
      <div className="card p-4">
        <PushToggle publicKey={pushPublicKey()} admin />
      </div>
    </div>
  )
}
