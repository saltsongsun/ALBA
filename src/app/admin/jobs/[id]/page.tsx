import { headcountTbd } from '@/lib/jobFields'
import Icon from '@/components/Icon'
import type { Metadata } from 'next'
import Link from 'next/link'
import RevealTabs from '@/components/RevealTabs'
import { notFound } from 'next/navigation'
import { cancelEvent, deleteJob, duplicateJob, nudgeComing, setJobStatus } from '@/app/actions/admin'
import Announce from '@/components/Announce'
import Flash from '@/components/Flash'
import { wageBadge } from '@/components/JobCard'
import JobActions from '@/components/JobActions'
import JobTools from '@/components/JobTools'
import { ConfirmSubmit, CopyButton, SubmitButton } from '@/components/ui'
import { getSettings, wageTotal } from '@/lib/data'
import { won } from '@/lib/format'
import { companyJob, jobInMyOtherCompany } from '@/lib/company'
import OtherCompanyJob from '@/components/OtherCompanyJob'
import { db, must } from '@/lib/db'
import { withWeeklyPay } from '@/lib/weekly'
import { workOver } from '@/lib/pay'
import { recruitText, scheduleText } from '@/lib/docs'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { dateList, fmtDate, fmtDateRange, kstDate, kstDateTime, kstTime } from '@/lib/time'
import { jobPhase } from '@/lib/jobPhase'
import { isComing, SIGN_NUDGE, SIGNAL } from '@/lib/signals'
import { lastNudge, lastNudgeAt, nudgeAgo } from '@/lib/nudge'
import { phoneFmt } from '@/lib/format'
import type { Application, Attendance, Job, SignedDoc, MemberType } from '@/lib/types'
import { isDate, isUuid } from '@/lib/validate'
import AppsTab from './AppsTab'
import AttTab from './AttTab'
import DocsTab from './DocsTab'
import PayTab from './PayTab'
import JobViewStats from '@/components/JobViewStats'
import ViewerInvite from '@/components/ViewerInvite'
import { memberViewers, viewStats } from '@/lib/views'

export const metadata: Metadata = { title: '공고 관리' }

export type WorkerLite = {
  id: string
  name: string
  phone: string
  birth_date: string | null
  bank_name: string | null
  bank_account_enc: string | null
  account_holder: string | null
  photo_at: string | null
  careers?: { event: string; period: string; role: string }[] | null
  /** 비상연락처 (근무자가 내 정보에 넣었을 때만) */
  emergency_phone?: string | null
  /** 가입 유형 · 전문 분야 */
  member_type?: MemberType
  specialty?: string | null
}
export type AppRow = Application & { user: WorkerLite }

/** 더보기 안의 한 줄 메뉴 */
const MENU_ROW = 'flex w-full items-center gap-2 px-3.5 py-3 text-left text-sm font-semibold transition hover:bg-bg active:bg-bg'

const STATUS_LABEL: Record<Job['status'], string> = { open: '모집중', closed: '모집마감', draft: '임시저장', done: '종료', cancelled: '행사 취소' }

export default async function AdminJobPage(props: PageProps<'/admin/jobs/[id]'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  if (!isUuid(id)) notFound()

  // 공고와 지원·출퇴근·서류를 한 번에 읽음
  const userCols = 'id, name, phone, birth_date, bank_name, bank_account_enc, account_holder, photo_at, careers, emergency_phone, address, member_type, specialty'
  // 조회 현황·후기는 공고 내용과 상관없이 먼저 출발 (기다리는 횟수를 줄임). 못 읽으면 빈 값
  const viewP = Promise.all([viewStats([id]), admin.companyVerified ? memberViewers(id) : Promise.resolve([] as Awaited<ReturnType<typeof memberViewers>>)])
    .then(async ([vstats, mviewers]) => ({
      vstats,
      mviewers,
      viewerNames: mviewers.length
        ? new Map((must(await db().from('users').select('id, name').in('id', mviewers.map((v) => v.user_id))) as { id: string; name: string }[]).map((u) => [u.id, u.name]))
        : new Map<string, string>(),
    }))
  // 이 공고에서 일한 근무자 후기 (이 회사 것만, 가려진 것 빼고). 못 읽어도 화면은 그대로
  const reviewsP = db()
    .from('company_reviews')
    .select('id, rating, body, created_at, hidden_at, job_id, company_id')
    .eq('job_id', id)
    .eq('company_id', admin.companyId)
    .is('hidden_at', null)
    .then(
      (r) => ((r.data ?? []) as { id: string; rating: number; body: string; created_at: string; hidden_at: string | null; job_id: string; company_id: string }[]).filter((x) => !x.hidden_at && x.job_id === id && x.company_id === admin.companyId),
      () => [] as { id: string; rating: number; body: string; created_at: string; hidden_at: string | null; job_id: string; company_id: string }[],
    )
  viewP.catch(() => {})
  const [job, settings, origin, apps, atts, docs, allTemplates, myRatings] = await Promise.all([
    companyJob(admin, id),
    getSettings(admin.companyId),
    siteOrigin(),
    db()
      .from('applications')
      .select(`*, user:users(${userCols})`).eq('company_id', admin.companyId)
      .eq('job_id', id)
      .order('created_at')
      .then((r) => must(r) as AppRow[]),
    db()
      .from('attendance')
      .select('*').eq('company_id', admin.companyId)
      .eq('job_id', id)
      .order('work_date')
      .then((r) => must(r) as Attendance[]),
    db()
      .from('signed_docs')
      .select('id, user_id, template_id, title, status, signed_at, created_at').eq('company_id', admin.companyId)
      .eq('job_id', id)
      .order('created_at')
      .then((r) => must(r) as Pick<SignedDoc, 'id' | 'user_id' | 'template_id' | 'title' | 'status' | 'signed_at' | 'created_at'>[]),
    db().from('doc_templates').select('id, title, kind').eq('company_id', admin.companyId).then((r) => must(r) as { id: string; title: string; kind: string }[]),
    // 내가 이 공고 근무자들에게 매긴 별점 (출퇴근 화면의 빠른 평가)
    db()
      .from('worker_ratings')
      .select('user_id, score').eq('company_id', admin.companyId)
      .eq('job_id', id)
      .eq('rater_id', admin.id)
      .then((r) => must(r) as { user_id: string; score: number }[]),
  ])
  if (!job) {
    // 내가 맡은 다른 회사의 공고면 (알림·공유 링크): 없는 화면 대신 그 회사로 바꿔서 열기 — 보려던 탭·날짜 그대로
    const other = await jobInMyOtherCompany(admin, id)
    if (!other) notFound()
    const q = new URLSearchParams()
    if (sp.tab === 'apps' || sp.tab === 'att' || sp.tab === 'pay' || sp.tab === 'docs') q.set('tab', sp.tab)
    if (typeof sp.date === 'string' && isDate(sp.date)) q.set('date', sp.date)
    return <OtherCompanyJob title="다른 회사 공고예요" company={other} now={admin.companyName} open={`/admin/jobs/${id}${q.size ? `?${q}` : ''}`} />
  }
  // 조회 현황 (관리자만): 확인한 인원·지금 보는 인원·본 가입자
  // 확인 전 회사에는 '본 가입자' 이름을 보여 주지 않음 (공고를 미끼로 회원 이름을 모으지 못하게)
  // 근로계약서를 종이·다른 서비스로 받으면 앱 서명 서류에서 계약서 서식은 뺌
  const templates = allTemplates.filter((t) => job.required_docs.includes(t.id) && (job.contract_method === 'app' || t.kind !== 'contract'))
  const today = kstDate()
  // 아직 모집 중인 공고 (마감·종료·취소·지난 행사가 아님)
  // 단톡방 모집 문구는 모집 중일 때만: 마지막 날 근무 시간이 지나면(모집중으로 남아 있어도) 숨김 — 끝난 공고를 다시 올리는 실수 막기
  const recruiting = job.status === 'open' && job.end_date >= today && !workOver(job, job.end_date)
  // 근로계약서를 받지 않는 공고는 위에 경고 (지난 공고·종료한 공고는 제외)
  // 전문가 의뢰는 근로계약서가 아니라 용역계약서(service)로 계약 (저장할 때 근로계약서는 빠지고 용역계약서가 들어감)
  const expertJob = job.audience === 'expert'
  const contractKind = expertJob ? 'service' : 'contract'
  const contractName = expertJob ? '용역계약서' : '근로계약서'
  const noContract = job.contract_method === 'app' && !['done', 'cancelled'].includes(job.status) && job.end_date >= today && !templates.some((t) => t.kind === contractKind)

  // 출퇴근 기록은 있는데 지원 내역이 없는 사람(관리자 직접 등록 등)도 정산에 포함
  const known = new Set(apps.map((a) => a.user_id))
  const extraIds = [...new Set(atts.map((a) => a.user_id))].filter((u) => !known.has(u))
  const extraUsersP = extraIds.length ? db().from('users').select(userCols).in('id', extraIds).then((r) => must(r) as WorkerLite[]) : Promise.resolve([] as WorkerLite[])
  const [{ vstats, mviewers, viewerNames }, extraUsers, jobReviews] = await Promise.all([viewP, extraUsersP, reviewsP])
  const users = new Map<string, WorkerLite>([...apps.map((a) => [a.user_id, a.user] as const), ...extraUsers.map((u) => [u.id, u] as const)])

  const dates = dateList(job.start_date, job.end_date)
  const date = typeof sp.date === 'string' && isDate(sp.date) && dates.includes(sp.date)
    ? sp.date
    : dates.includes(today) ? today : dates[0]
  const tab = (['apps', 'att', 'pay', 'docs'] as const).find((t) => t === sp.tab) ?? (dates.includes(today) ? 'att' : 'apps')
  const approved = apps.filter((a) => a.status === 'approved')
  // 보류한 지원자는 '대기'에서 빼고 (지원자 탭 '보류'에 따로)
  const waiting = apps.filter((a) => a.status === 'applied' && !a.held_at)
  const pendingDocs = docs.filter((d) => d.status === 'pending').length
  // 서류 탭: 이 공고에 마지막으로 보낸 '서명 요청' 앱 알림 (금방 또 보내 같은 알림이 겹치지 않게) · 우리 회사 문의함에서만
  const lastSignNudge = tab === 'docs' && pendingDocs > 0 ? await lastNudgeAt(admin.companyId, job.id, SIGN_NUDGE) : null
  // 확정자 공지 칸: 마지막으로 보낸 공지 (같은 공지를 또 보내지 않게 · 고쳐서 다시 보낼 때 불러오기) — 공지 칸이 보일 때만
  const showAnnounce = approved.length > 0 && !['done', 'cancelled'].includes(job.status)
  const lastNotice = showAnnounce ? await lastNudge(admin.companyId, job.id, '📢 공지') : null
  const lastNoticeAgo = nudgeAgo(lastNotice?.at)
  // 아직 근무 기록이 없고 끝나지 않은 행사만 '행사 취소' 가능
  const canCancel = !['done', 'cancelled', 'draft'].includes(job.status) && job.end_date >= today && atts.length === 0
  // 공고 지급총액 (세전 · 정산 탭과 같은 계산)
  // (주휴수당 포함 · 같은 회사 여러 공고를 합쳐 주마다 확인)
  const wage = wageTotal(job, await withWeeklyPay(atts, job.company_id))
  const link = `${origin}/jobs/${job.id}`
  const text = recruitText(job, link, settings.company_name)

  const TABS = [
    ['apps', `지원자 ${apps.filter((a) => a.status !== 'cancelled').length}`],
    ['att', '출퇴근'],
    ['pay', '정산'],
    ['docs', `서류${pendingDocs ? ` (대기 ${pendingDocs})` : ''}`],
  ] as const

  // 시나리오: 행사 전날 밤 '확정자가 진짜 올까?' → 전날 안내(⏰ 내일 근무 안내)를 읽었는지, 안 읽은 사람에게 바로 전화
  const tomorrowKst = kstDate(new Date(Date.now() + 86_400_000))
  const remindRead =
    ['open', 'closed'].includes(job.status) && (job.start_date === today || job.start_date === tomorrowKst)
      ? await db()
          .from('messages')
          .select('thread_user_id, read_at, body, sender_id, created_at')
          .eq('company_id', admin.companyId)
          .eq('job_id', id)
          .eq('from_admin', true)
          .like('body', `${SIGNAL.remind}%`)
          .then(
            (r) => {
              const rows = ((r.data ?? []) as { thread_user_id: string; read_at: string | null; body: string; sender_id: string | null; created_at: string }[]).filter((m) => m.body.startsWith(SIGNAL.remind))
              const by = new Map<string, boolean>()
              for (const m of rows) by.set(m.thread_user_id, (by.get(m.thread_user_id) ?? false) || !!m.read_at)
              // 관리자가 '다시 알리기'로 보낸 마지막 시각 (자동 안내는 보낸 사람이 없음)
              const nudgedAt = rows.filter((m) => m.sender_id).map((m) => m.created_at).sort().at(-1) ?? null
              return by.size ? { total: by.size, unread: [...by.entries()].filter(([, read]) => !read).map(([uid]) => uid), nudgedAt } : null
            },
            () => null,
          )
      : null
  // 근무자가 전날 '내일 갈게요'를 누른 사람 (첫날 근무 기준) — 전날 안내가 가기 전에 눌러도 셈
  const firstDayIds = approved.filter((a) => !a.available_dates || a.available_dates.includes(job.start_date)).map((a) => a.user_id)
  const coming =
    ['open', 'closed'].includes(job.status) && (job.start_date === today || job.start_date === tomorrowKst) && firstDayIds.length
      ? await db()
          .from('messages')
          .select('thread_user_id, body')
          .eq('company_id', admin.companyId)
          .eq('job_id', id)
          .eq('from_admin', false)
          .like('body', `${SIGNAL.coming}%`)
          .then(
            (r) => new Set(((r.data ?? []) as { thread_user_id: string; body: string }[]).filter((m) => isComing(m.body, job.start_date) && firstDayIds.includes(m.thread_user_id)).map((m) => m.thread_user_id)),
            () => new Set<string>(),
          )
      : new Set<string>()
  // 전화해 볼 사람: 누가 '갈게요'를 누르기 시작했으면 아직 답 없는 사람 전부(안 읽은 사람 표시), 아무도 안 눌렀으면 예전처럼 안내를 안 읽은 사람만
  const unreadSet = new Set(remindRead?.unread ?? [])
  const toCall = coming.size ? firstDayIds.filter((uid) => !coming.has(uid)) : [...unreadSet]
  // 지금 할 일 큰 버튼의 숫자: 오늘(행사가 지났으면 남은 기록 전체) 근무 중·퇴근·미출근
  const phase = jobPhase(job, today)
  const dayAtts = atts.filter((a) => a.work_date === today)
  const actWorking = phase === 'after' ? atts.filter((a) => !a.clock_out).length : dayAtts.filter((a) => !a.clock_out).length
  const actFinished = dayAtts.filter((a) => a.clock_out).length
  const cameToday = new Set(dayAtts.map((a) => a.user_id))
  const actAbsent = dates.includes(today) ? approved.filter((a) => (!a.available_dates || a.available_dates.includes(today)) && !cameToday.has(a.user_id)).length : 0
  const reviewAvg = jobReviews.length ? Math.round((jobReviews.reduce((n, r) => n + r.rating, 0) / jobReviews.length) * 10) / 10 : 0
  return (
    <div className="space-y-5">
      <Flash m={sp.m} />
      <Link href="/admin/jobs" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 공고 목록
      </Link>

      {/* 모집 문구 칸은 모집 중일 때만 (마감·종료·취소된 공고를 단톡방에 다시 올리는 실수를 막고 화면도 짧게) */}
      <div className={`grid gap-4 ${recruiting ? 'lg:grid-cols-[1fr_380px]' : ''}`}>
        {/* min-w-0: 긴 행사 이름이 칸을 넓혀 좁은 휴대폰(320px)에서 화면이 밀리지 않게 */}
        <div className="card min-w-0">
          <div className="flex items-center gap-2">
            <span className={`badge shrink-0 ${job.status === 'cancelled' ? 'bg-rose-600 text-white' : 'bg-ink text-white'}`}>{job.status === 'open' && workOver(job, job.end_date) ? '근무 끝' : STATUS_LABEL[job.status]}</span>
            {job.event_name && <span className="w-0 min-w-0 flex-1 truncate text-sm font-semibold text-mute">{job.event_name}</span>}
            <Link href={`/admin/jobs/${job.id}/edit`} className={`btn-soft btn-sm shrink-0 ${job.event_name ? '' : 'ml-auto'}`} data-job-edit>
              <Icon name="pen" /> 수정
            </Link>
          </div>
          {job.audience === 'expert' && <span className="badge mt-1 bg-violet-50 text-violet-700">🎛️ 전문가 의뢰 · 용역계약 · 사업소득 3.3%</span>}
          <h1 className="mt-1 text-2xl font-extrabold">{job.title}</h1>
          <p className="mt-1 text-sub">
            {fmtDateRange(job.start_date, job.end_date)} {scheduleText(job)}
            {job.location_name && ` · ${job.location_name}`}
          </p>
          <p className="mt-1 text-sm">
            {wageBadge(job)} · 확정 <b>{approved.length}</b>
            {headcountTbd(job) ? '명 · 인원 미정' : `/${job.headcount}명`} · 대기 {waiting.length}명
            {job.gps_required && <span className="badge ml-2 bg-emerald-50 text-emerald-700">현장 위치 확인</span>}
            {job.auto_approve && <span className="badge ml-1 bg-brand-50 text-brand-700">자동 확정</span>}
          </p>
          {/* 지급총액 (세전, 정산 탭과 같은 계산) → 정산 탭으로 */}
          {wage.gross > 0 && (
            <Link href={`/admin/jobs/${job.id}?tab=pay`} className="mt-1.5 inline-flex flex-wrap items-center gap-x-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-sm text-emerald-900 tabular-nums" data-job-wage>
              <span>
                지급총액 <b>{won(wage.gross)}</b>
              </span>
              <span className="text-xs text-emerald-700">
                세전 · {wage.people}명{wage.net > 0 && wage.paidNet >= wage.net ? ' · 지급 완료' : ''}
              </span>
            </Link>
          )}
          <JobViewStats jobId={job.id} initial={vstats[job.id]} />
          {mviewers.length > 0 && (
            <ViewerInvite
              jobId={job.id}
              canInvite={job.status === 'open' && job.end_date >= today}
              viewers={mviewers.map((v) => ({
                id: v.user_id,
                name: viewerNames.get(v.user_id) ?? '알 수 없음',
                seen: kstDateTime(v.last_seen),
                visits: v.visits,
                live: v.live,
                applied: apps.some((a) => a.user_id === v.user_id && a.status !== 'cancelled'),
              }))}
            />
          )}
          {job.contract_method !== 'app' && approved.length > 0 && (
            <Link href={`/admin/jobs/${job.id}?tab=docs`} className="mt-1.5 inline-block text-sm">
              📝 {contractName} {job.contract_method === 'paper' ? '종이' : '모두싸인 등'} · 받음{' '}
              <b className={approved.some((a) => !a.contract_received_at) ? 'text-rose-600' : 'text-emerald-600'}>
                {approved.filter((a) => a.contract_received_at).length}/{approved.length}
              </b>
            </Link>
          )}
          {noContract && (
            <div className="mt-4 animate-pop rounded-2xl bg-amber-50/50 p-4 ring-1 ring-amber-200/70">
              <p className="font-bold">✍️ {contractName}를 받지 않는 {expertJob ? '의뢰' : '공고'}예요</p>
              <p className="mt-1 text-sm text-sub">
                {expertJob ? '전문가 의뢰는 용역계약서로 계약해요.' : '근로계약서는 근로기준법 제17조에 따라 서면(전자문서)으로 꼭 줘야 해요.'} 지정하면
                {approved.length > 0 ? ` 이미 확정된 ${approved.length}명에게도 바로 ` : ' 확정되는 사람에게 '}
                서명 요청이 가고, 서명 전에는 근무 시작 버튼이 잠겨요.
              </p>
              <Link href={`/admin/jobs/${job.id}/edit#docs`} className="btn-primary btn-sm mt-3">
                {contractName} 지정하기
              </Link>
            </div>
          )}
          {/* 지금 할 일: 전날 안내 확인 → 큰 버튼 → 도구 줄 (정보와 줄로 나눔) */}
          <div className="mt-4 space-y-3 border-t border-line pt-4" data-job-now>
            {/* 시나리오: 행사 전날 밤 '확정자가 진짜 올까?' → 전날 안내를 읽었는지, 안 읽은 사람에게 바로 전화 */}
            {(remindRead || coming.size > 0) && (
              <div
                className={`space-y-1.5 rounded-2xl px-3.5 py-3 text-sm transition-colors duration-300 ${coming.size >= firstDayIds.length && firstDayIds.length ? 'bg-emerald-50' : 'bg-bg'}`}
                data-remind-read
                data-coming-all={coming.size >= firstDayIds.length && firstDayIds.length ? '' : undefined}
              >
                {remindRead && (
                <p className="flex items-center justify-between gap-2">
                  <span className="min-w-0 font-semibold">
                    <Icon name="bell" className="text-mute" /> 전날 안내 확인{' '}
                    <b className={`tabular-nums ${remindRead.unread.length ? 'text-amber-600' : 'text-emerald-600'}`}>{remindRead.total - remindRead.unread.length}</b>/{remindRead.total}명
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${remindRead.unread.length ? 'text-sub' : 'text-emerald-600'}`}>
                    {remindRead.unread.length ? `안 읽음 ${remindRead.unread.length}명` : '모두 읽었어요'}
                  </span>
                </p>
                )}
                {/* 근무자가 '내일 갈게요'를 누른 수 — 한 명이라도 눌렀거나 안내가 나간 뒤에 */}
                <p className="flex items-center justify-between gap-2" data-coming-count>
                  <span className="min-w-0 font-semibold">
                    <Icon name="check" className="text-mute" /> ‘갈게요’ 누름{' '}
                    <b className={`tabular-nums ${coming.size >= firstDayIds.length ? 'text-emerald-600' : coming.size ? 'text-amber-600' : 'text-sub'}`}>{coming.size}</b>/{firstDayIds.length}명
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${coming.size >= firstDayIds.length ? 'text-emerald-600' : 'text-sub'}`}>
                    {coming.size >= firstDayIds.length ? '모두 온대요' : coming.size ? `답 없음 ${firstDayIds.length - coming.size}명` : '아직 없어요'}
                  </span>
                </p>
                {toCall.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {toCall.map((uid) => {
                      const u = users.get(uid)
                      const tel = (u?.phone ?? '').replace(/\D/g, '')
                      return tel ? (
                        <a
                          key={uid}
                          href={`tel:${tel}`}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-line transition active:scale-95"
                          aria-label={`${u?.name} ${phoneFmt(u?.phone)} 전화`}
                          data-unread-person
                        >
                          <Icon name="phone" className="text-emerald-600" /> {u?.name}
                          {coming.size > 0 && unreadSet.has(uid) && <span className="text-xs font-medium text-amber-700">안 읽음</span>}
                        </a>
                      ) : null
                    })}
                  </div>
                )}
                {/* 전화 돌리기 전에 한 번에: 아직 안 누른 확정자에게 다시 알림 (근무 전날에만 · 두 번 눌러야 보냄) */}
                {job.start_date === tomorrowKst && firstDayIds.length > coming.size && (
                  <form action={nudgeComing.bind(null, job.id)} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1" data-nudge>
                    <ConfirmSubmit className="chip h-9 bg-brand-50 px-3.5 text-brand-700 ring-0" confirmText={`${firstDayIds.length - coming.size}명에게 보낼까요?`} track="답 없는 사람에게 다시 알리기">
                      <Icon name="bell" /> 답 없는 {firstDayIds.length - coming.size}명에게 다시 알리기
                    </ConfirmSubmit>
                    {remindRead?.nudgedAt && (
                      <span className="text-xs whitespace-nowrap text-mute" data-nudged-at>
                        {kstTime(remindRead.nudgedAt)}에 다시 알림
                      </span>
                    )}
                  </form>
                )}
              </div>
            )}
            <JobActions job={job} today={today} working={actWorking} finished={actFinished} absent={actAbsent} waiting={waiting.length} approved={approved.length} headcount={job.headcount} />
            {/* 같은 크기 칸 한 줄 · 자주 안 쓰는 것(복사·모집·행사 취소·삭제)은 더보기 안에 · 행사 종료는 위의 큰 버튼 */}
            <JobTools
              tools={[
                ...(job.status !== 'draft' ? [{ href: `/admin/chat/room/${job.id}`, icon: 'users' as const, label: '단체방' }] : []),
                ...(!['done', 'cancelled', 'draft'].includes(job.status) && job.end_date >= today ? [{ href: `/admin/jobs/${job.id}?tab=att&date=${date}&shift=1#shift`, icon: 'clock' as const, label: '시간 변경' }] : []),
                // 행사 당일: 새 인력이 QR만 찍으면 가입·로그인 후 바로 확정
                ...(['open', 'closed'].includes(job.status) && dates.includes(today) ? [{ href: `/admin/jobs/${job.id}/qr`, icon: 'qr' as const, label: '긴급 QR', tone: 'rose' as const }] : []),
              ]}
              more={
                <div className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
                  <form action={duplicateJob.bind(null, job.id)}>
                    <SubmitButton className={MENU_ROW} pendingText="복사하는 중…">
                      <Icon name="copy" className="text-mute" /> 복사해서 새 공고
                    </SubmitButton>
                  </form>
                  {job.status !== 'open' && job.status !== 'cancelled' && (
                    <form action={setJobStatus.bind(null, job.id, 'open')}>
                      <SubmitButton className={MENU_ROW}>
                        <Icon name="megaphone" className="text-mute" /> 모집 열기
                      </SubmitButton>
                    </form>
                  )}
                  {job.status === 'open' && (
                    <form action={setJobStatus.bind(null, job.id, 'closed')}>
                      <SubmitButton className={MENU_ROW}>
                        <Icon name="check" className="text-mute" /> 모집 마감
                      </SubmitButton>
                    </form>
                  )}
                  {/* 비·주최측 사정 등으로 행사가 열리지 않을 때: 사유와 함께 확정·지원자 모두에게 알림 (아직 근무 기록이 없을 때만) */}
                  {canCancel && (
                    <details className="px-3.5 py-3">
                      <summary className="cursor-pointer text-sm font-semibold text-rose-600">행사가 취소됐나요? (우천·주최측 사정 등)</summary>
                      <form action={cancelEvent.bind(null, job.id)} className="mt-2.5 space-y-2.5">
                        <textarea
                          name="reason"
                          required
                          maxLength={200}
                          rows={2}
                          className="input text-sm"
                          placeholder="취소 사유 (근무자에게 그대로 전달돼요) 예: 태풍 예보로 주최측이 행사를 취소했습니다."
                        />
                        <p className="hint">
                          확정 {approved.length}명 · 대기 {waiting.length}명에게 앱 문의함과 휴대폰 알림으로 알리고, 지원은 모두 취소돼요. 되돌릴 수 없어요.
                        </p>
                        <ConfirmSubmit className="btn-danger btn-sm" confirmText="정말 취소하고 알릴까요?">
                          행사 취소하고 알리기
                        </ConfirmSubmit>
                      </form>
                    </details>
                  )}
                  <form action={deleteJob.bind(null, job.id)}>
                    <ConfirmSubmit className={`${MENU_ROW} text-rose-600`} confirmText="정말 삭제?">
                      <Icon name="trash" /> 삭제
                    </ConfirmSubmit>
                  </form>
                </div>
              }
            />
          </div>
          {job.status === 'cancelled' && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
              취소한 행사예요. 지원·확정은 모두 취소됐고 근무자에게 알렸어요. 다시 모집하려면 ‘더보기 → 복사해서 새 공고’를 눌러 주세요.
            </p>
          )}
        </div>

        {recruiting && (
        <div className="card min-w-0 space-y-2" data-recruit-text>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">단톡방 모집 문구</h2>
            <div className="flex gap-1">
              <CopyButton text={link} label="링크만" />
              <CopyButton text={text} label="문구 복사" className="btn-primary btn-sm" />
            </div>
          </div>
          {/* 문구는 복사 버튼으로 바로 쓰고, 내용은 필요할 때만 펼쳐 봄 */}
          <details className="text-sm">
            <summary className="cursor-pointer py-1 font-semibold text-sub">문구 미리보기</summary>
            <textarea readOnly value={text} rows={9} className="input mt-2 resize-none bg-bg text-[13px] leading-relaxed" />
          </details>
        </div>
        )}
      </div>

      {showAnnounce && (
        <Announce
          jobId={job.id}
          jobTitle={job.title}
          last={lastNotice && lastNoticeAgo ? { body: lastNotice.body, when: lastNoticeAgo.when, recent: lastNoticeAgo.recent } : null}
          recipients={approved.map((a) => ({ phone: a.user.phone, dates: a.available_dates, position: a.position }))}
          dates={dates.map((d) => ({ value: d, label: fmtDate(d) }))}
        />
      )}

      {jobReviews.length > 0 && (
        <details className="card p-4" data-job-reviews>
          <summary className="flex cursor-pointer items-center gap-2 font-bold">
            ⭐ 근무자 후기 <b className="text-amber-500 tabular-nums">{reviewAvg.toFixed(1)}</b>
            <span className="font-normal text-mute">· {jobReviews.length}개</span>
          </summary>
          <ul className="mt-3 space-y-1.5">
            {jobReviews
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((r) => (
                <li key={r.id} className="rounded-xl bg-bg px-3 py-2 text-sm">
                  <b className="text-amber-500">{'★'.repeat(r.rating)}</b> {r.body}
                </li>
              ))}
          </ul>
          <p className="mt-2 text-xs text-mute">실제로 일한 근무자가 별명으로 남긴 후기예요. 누가 썼는지는 보이지 않아요.</p>
        </details>
      )}

      {/* 탭을 바꾸면 맨 위(큰 제목 카드)로 올라가 매번 다시 내려야 하던 것 → 탭 줄로 바로 (#tabs) */}
      {/* 한참 내려가 있어도 위로 살짝 올리면 머리글 아래에 다시 나타남 (탭을 바꾸려고 맨 위까지 올라가지 않게) */}
      <RevealTabs id="tabs" className="flex scroll-mt-16 gap-1 overflow-x-auto border-b border-line text-sm font-semibold" data-job-tabs>
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/jobs/${job.id}?tab=${k}${k === 'att' ? `&date=${date}` : ''}#tabs`}
            className={`shrink-0 border-b-2 px-4 py-2.5 transition-colors duration-200 ${tab === k ? 'border-ink text-ink' : 'border-transparent text-mute hover:text-sub'}`}
          >
            {label}
          </Link>
        ))}
      </RevealTabs>

      {tab === 'apps' && (
        <AppsTab
          job={job}
          apps={apps}
          origin={origin}
          sort={typeof sp.sort === 'string' ? sp.sort : 'time'}
          day={typeof sp.day === 'string' && isDate(sp.day) ? sp.day : null}
          canAddDirect={admin.companyVerified}
        />
      )}
      {tab === 'att' && <AttTab job={job} apps={approved} waiting={waiting} atts={atts} users={users} date={date} dates={dates} myScores={Object.fromEntries(myRatings.map((r) => [r.user_id, r.score]))} pos={typeof sp.pos === 'string' ? sp.pos : null} st={sp.st === 'working' || sp.st === 'done' || sp.st === 'absent' || sp.st === 'late' ? sp.st : null} openShift={sp.shift === '1'} faces={sp.view === 'faces'} check={sp.view === 'check'} fix={typeof sp.fix === 'string' ? sp.fix : null} fromPay={sp.from === 'pay'} />}
      {tab === 'pay' && <PayTab job={job} atts={atts} users={users} origin={origin} />}
      {tab === 'docs' && <DocsTab job={job} approved={approved} docs={docs} templates={templates} users={users} origin={origin} lastNudge={lastSignNudge} />}
    </div>
  )
}
