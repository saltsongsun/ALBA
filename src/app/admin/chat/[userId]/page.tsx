import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { replyInquiry } from '@/app/actions/chat'
import { switchCompany } from '@/app/actions/company'
import OtherCompanyJob from '@/components/OtherCompanyJob'
import { SubmitButton } from '@/components/ui'
import { ADMIN_CHAT_BUTTONS } from '@/lib/chatButtons'
import AutoRefresh from '@/components/AutoRefresh'
import Avatar from '@/components/Avatar'
import { CHAT_MESSAGE_COLS, ChatMessages, type ChatMessage } from '@/components/Chat'
import ChatComposer, { ScrollToEnd } from '@/components/ChatComposer'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import Icon from '@/components/Icon'
import ReadSync from '@/components/ReadSync'
import { db, must } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { workerInCompany } from '@/lib/company'
import { ASK_CONFIRM, ASK_MISSED, parsePayday, SIGNAL } from '@/lib/signals'
import { paydayLabel } from '@/lib/payday'
import { isUuid } from '@/lib/validate'
import { fmtDate, hhmm, kstAt, kstDate, kstTime } from '@/lib/time'

export const metadata: Metadata = { title: '문의 대화' }

const QUICK_REPLIES = ['확인했습니다.', '담당자가 곧 전화드릴게요.', '앱의 내 근무 화면에서 확인해 주세요.', '감사합니다!']

/** 근무자가 마지막으로 보낸 현장 알림·요청에 맞는 답장 (앞에 붙여 보여 줌) */
function repliesFor(last: ChatMessage | undefined): string[] {
  const head = last?.body.split('\n', 1)[0] ?? ''
  if (head.startsWith(SIGNAL.late)) return ['네, 조심히 오세요.', '도착하면 앱에서 근무 시작을 눌러 주세요.']
  if (head.startsWith(SIGNAL.arrive)) return ['출근 처리했어요. 오늘도 잘 부탁해요!', '현장 운영본부로 와 주세요.']
  if (head.startsWith(SIGNAL.fix)) return ['요청대로 기록을 고쳤어요.', '확인해 보고 다시 알려 드릴게요.']
  if (head.startsWith('⚠️ 근무일 취소') || head.startsWith('⚠️ 확정 취소')) return ['알려 줘서 고마워요. 다음에 또 함께해요.', '혹시 일정이 되면 다시 알려 주세요.']
  if (head.startsWith('⚠️ 근무시간')) return ['알겠어요. 원래 시간에 마쳐 주세요.', '괜찮아요. 일정은 따로 상의해요.']
  if (head.startsWith('🕒 근무 종료 늦게 입력')) return ['확인했어요. 다음엔 근무 종료를 꼭 눌러 주세요.']
  if (head.startsWith(ASK_MISSED.slice(0, 20))) return ['출근 기록을 넣었어요. 확인해 주세요.', '몇 시에 도착했는지 알려 주세요.']
  // '지원했는데 확정 여부가 궁금해요' (곧 시작인데 아직 확정 전인 지원자)
  if (head.startsWith(ASK_CONFIRM.slice(0, 12))) return ['확정했어요. 내 근무에서 확인해 주세요.', '검토 중이에요. 오늘 안에 알려 드릴게요.', '이번에는 인원이 다 찼어요. 다음에 꼭 함께해요.']
  return []
}

export default async function AdminChatThread(props: PageProps<'/admin/chat/[userId]'>) {
  const admin = await requireAdmin()
  const [{ userId }, sp] = await Promise.all([props.params, props.searchParams])
  if (!isUuid(userId)) notFound()
  const today = kstDate()
  type WorkJob = { id: string; title: string; start_date: string; end_date: string; start_time: string; end_time: string; status: string }
  const [{ data: worker }, messages, , myApps, todayAtts] = await Promise.all([
    db().from('users').select('id, name, phone, photo_at').eq('id', userId).maybeSingle(),
    db()
      .from('messages')
      .select(CHAT_MESSAGE_COLS).eq('company_id', admin.companyId)
      .eq('thread_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(300)
      .then((r) => (must(r) as unknown as ChatMessage[]).sort((a, b) => a.created_at.localeCompare(b.created_at))),
    // 이 회사로 온 근무자 문의를 읽음으로 (이 회사 관리자 누구든 한 번 읽으면 읽음)
    db().from('messages').update({ read_at: new Date().toISOString() }).eq('company_id', admin.companyId).eq('thread_user_id', userId).eq('from_admin', false).is('read_at', null),
    // 이름 아래 한 줄: 이 회사에서 오늘 근무 상태(근무 중·퇴근·출근 전) 또는 다음 근무 (답장할 때 상황을 바로 알게)
    db()
      .from('applications')
      .select('job:jobs(id, title, start_date, end_date, start_time, end_time, status)')
      .eq('company_id', admin.companyId)
      .eq('user_id', userId)
      .eq('status', 'approved')
      .then((r) => ((r.data ?? []) as unknown as { job: WorkJob | null }[]).map((a) => a.job).filter((j): j is WorkJob => !!j && j.status !== 'cancelled' && j.end_date >= today)),
    db()
      .from('attendance')
      .select('job_id, clock_in, clock_out')
      .eq('company_id', admin.companyId)
      .eq('user_id', userId)
      .eq('work_date', today)
      .then((r) => (r.data ?? []) as { job_id: string; clock_in: string; clock_out: string | null }[]),
  ])
  // 내가 맡은 다른 회사로 이 사람이 보낸 문의 (알림을 눌러 왔는데 지금 보는 회사가 다를 때: 그 회사로 바꿔서 열게)
  const otherIds = admin.companies.filter((c) => c.id !== admin.companyId).map((c) => c.id)
  const otherMsgs = worker && otherIds.length
    ? await db()
        .from('messages')
        .select('company_id, from_admin, read_at, created_at')
        .eq('thread_user_id', userId)
        .in('company_id', otherIds)
        .limit(300)
        .then((r) => ((r.data ?? []) as { company_id: string; from_admin: boolean; read_at: string | null; created_at: string }[]).filter((m) => otherIds.includes(m.company_id)))
    : []
  const otherUnread = admin.companies
    .filter((c) => c.id !== admin.companyId)
    .map((c) => ({ id: c.id, name: c.name, n: otherMsgs.filter((m) => m.company_id === c.id && !m.from_admin && !m.read_at).length }))
    .filter((c) => c.n > 0)
  // 이 회사에 문의했거나 지원한 근무자만
  if (!worker || (!messages.length && !(await workerInCompany(admin.companyId, userId)))) {
    // 다른 회사(내가 맡은)와 주고받은 글이 있으면: 없는 화면 대신 그 회사로 — 안 읽은 글이 있는 회사 먼저, 없으면 가장 최근에 주고받은 회사
    const latest = [...otherMsgs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    const target = otherUnread[0] ?? admin.companies.find((c) => c.id === latest?.company_id)
    if (!worker || !target) notFound()
    return (
      <OtherCompanyJob
        title="다른 회사로 온 문의예요"
        company={{ id: target.id, name: target.name }}
        now={admin.companyName}
        open={`/admin/chat/${userId}`}
        back={{ href: '/admin/chat', label: '지금 회사 문의 목록으로' }}
      />
    )
  }

  // 시나리오: '돈 언제 들어와요?' 문의 → 가장 최근 일한 공고의 정산 예정일로 답장 제안 (알린 날짜가 있으면 그것, 없으면 공고의 지급일)
  const lastAsk = messages.filter((m) => !m.from_admin).at(-1)
  let payReply: string | null = null
  if (lastAsk && /정산|입금|급여|월급|돈|지급|언제 들어/.test(lastAsk.body)) {
    const { data: worked } = await db()
      .from('attendance')
      .select('job_id, work_date, paid, job:jobs(title, pay_day, end_date)')
      .eq('company_id', admin.companyId)
      .eq('user_id', userId)
      .order('work_date', { ascending: false })
      .limit(10)
    const rows = ((worked ?? []) as unknown as { job_id: string; work_date: string; paid: boolean; job: { title: string; pay_day: string | null; end_date: string } | null }[])
      .filter((r) => r.job)
      .sort((a, b) => b.work_date.localeCompare(a.work_date))
    const last = rows.find((r) => !r.paid) ?? rows[0]
    if (last?.job) {
      const told = messages.filter((m) => m.from_admin && m.body.startsWith(SIGNAL.payday) && m.body.includes(last.job!.title)).at(-1)
      const label = (told && parsePayday(told.body)) || paydayLabel(last.job.pay_day, last.job.end_date)
      payReply = rows.filter((r) => r.job_id === last.job_id).every((r) => r.paid) ? '급여는 지급했어요. 통장을 확인해 주세요.' : label ? `정산 예정일은 ${label}이에요.` : null
    }
  }

  const upcoming = [...myApps].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.start_time.localeCompare(b.start_time))
  const todayJob = upcoming.find((j) => j.start_date <= today)
  const nextJob = upcoming.find((j) => j.start_date > today)
  let workLine: { dot: string; text: string; title: string; href: string } | null = null
  if (todayJob) {
    const att = todayAtts.find((a) => a.job_id === todayJob.id)
    let endAt = kstAt(today, todayJob.end_time).getTime()
    if (todayJob.end_time <= todayJob.start_time) endAt += 86_400_000
    workLine = {
      dot: att ? (att.clock_out ? 'bg-gray-400' : 'bg-emerald-500') : 'bg-amber-400',
      text: att
        ? att.clock_out
          ? `오늘 퇴근 ${kstTime(att.clock_out)}`
          : `오늘 근무 중 · ${kstTime(att.clock_in)} 시작`
        : Date.now() >= endAt
          ? '오늘 근무 · 출근 기록 없음'
          : `오늘 ${hhmm(todayJob.start_time)}~${hhmm(todayJob.end_time)} · 출근 전`,
      title: todayJob.title,
      href: `/admin/jobs/${todayJob.id}?tab=att`,
    }
  } else if (nextJob) {
    workLine = { dot: 'bg-sky-400', text: `다음 근무 ${fmtDate(nextJob.start_date)} ${hhmm(nextJob.start_time)}`, title: nextJob.title, href: `/admin/jobs/${nextJob.id}` }
  }

  // '오늘 출근했는데 근무 시작을 못 눌렀어요' → 이 회사 오늘 근무에 출근 기록이 없으면 바로 '기록 넣기' (출퇴근 탭의 그 사람 · 수기 등록 칸 펼침)
  let missed: { jobId: string; title: string } | null = null
  if (lastAsk?.body.startsWith(ASK_MISSED.slice(0, 20))) {
    const { data: apps } = await db()
      .from('applications')
      .select('job_id, job:jobs(id, title, start_date, end_date, company_id)')
      .eq('company_id', admin.companyId)
      .eq('user_id', userId)
      .eq('status', 'approved')
    const job = ((apps ?? []) as unknown as { job: { id: string; title: string; start_date: string; end_date: string; company_id: string } | null }[])
      .map((r) => r.job)
      .find((j) => j && j.company_id === admin.companyId && j.start_date <= today && j.end_date >= today)
    if (job) {
      const { data: att } = await db().from('attendance').select('id').eq('company_id', admin.companyId).eq('job_id', job.id).eq('user_id', userId).eq('work_date', today).maybeSingle()
      if (!att) missed = { jobId: job.id, title: job.title }
    }
  }

  // '확정 여부가 궁금해요' → 이 회사에서 확정을 기다리는 그 사람의 지원으로 바로 (물어본 공고 먼저, 없으면 가장 빨리 시작하는 것)
  let waitingApp: { appId: string; jobId: string; title: string; start: string } | null = null
  if (lastAsk?.body.startsWith(ASK_CONFIRM.slice(0, 12))) {
    const { data: apps } = await db()
      .from('applications')
      .select('id, job_id, status, company_id, job:jobs(id, title, start_date, end_date, status)')
      .eq('company_id', admin.companyId)
      .eq('user_id', userId)
      .eq('status', 'applied')
    const rows = ((apps ?? []) as unknown as { id: string; job_id: string; status: string; company_id: string; job: { id: string; title: string; start_date: string; end_date: string; status: string } | null }[])
      .filter((r) => r.status === 'applied' && r.company_id === admin.companyId && r.job && r.job.end_date >= today && r.job.status !== 'cancelled')
      .sort((a, b) => a.job!.start_date.localeCompare(b.job!.start_date))
    const pick = rows.find((r) => r.job_id === lastAsk.job?.id) ?? rows[0]
    if (pick?.job) waitingApp = { appId: pick.id, jobId: pick.job_id, title: pick.job.title, start: pick.job.start_date }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* 회사를 바꿔서 이 대화를 열었을 때: '○○ 화면으로 바꿨어요' */}
      <Flash m={sp.m} />
      <AutoRefresh seconds={5} quiet pulse="/api/pulse?s=admin-chat" />
      <ScrollToEnd count={messages.length} />
      <ReadSync tag={`chat-${worker.id}`} />
      <div className="flex items-center justify-between gap-2">
        <Link href="/admin/chat" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 문의 목록
        </Link>
        {messages.length > 0 && (
          <a href={`/admin/chat/${worker.id}/export`} download className="chip h-8 px-3 text-xs">
            ⬇️ 대화 저장
          </a>
        )}
      </div>
      {/* 이 사람이 내가 맡은 다른 회사로 보낸 새 문의: 누르면 그 회사로 바꿔 이 대화를 엶 (알림을 눌렀는데 새 글이 안 보일 때) */}
      {otherUnread.length > 0 && (
        <div className="flex animate-pop flex-wrap items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm" data-thread-other>
          <span className="font-semibold text-brand-700">
            <Icon name="building" /> 다른 회사로 온 새 문의
          </span>
          {otherUnread.map((c) => (
            <form key={c.id} action={switchCompany} className="max-w-full">
              <input type="hidden" name="company" value={c.id} />
              <input type="hidden" name="open" value={`/admin/chat/${worker.id}`} />
              <SubmitButton className="chip max-w-full" pendingText="바꾸는 중…" track="다른 회사 문의 대화 열기">
                <span className="min-w-0 truncate">{c.name}</span>
                <b className="shrink-0 text-rose-600">{c.n}</b>
              </SubmitButton>
            </form>
          ))}
        </div>
      )}
      <div className="card flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar id={worker.id} name={worker.name} photoAt={worker.photo_at} />
          <div className="min-w-0">
            <Link href={`/admin/workers/${worker.id}`} className="text-lg font-bold hover:text-brand-600">
              {worker.name}
            </Link>
            {/* 이 회사 오늘 근무 상태(또는 다음 근무) 한 줄 · 누르면 그 공고 */}
            {workLine && (
              <Link href={workLine.href} className="flex min-w-0 items-center gap-1.5 text-xs text-sub" data-chat-work>
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${workLine.dot}`} />
                <span className="truncate">
                  <b className="font-semibold text-ink">{workLine.text}</b> · {workLine.title}
                </span>
              </Link>
            )}
          </div>
        </div>
        <ContactButtons phone={worker.phone} name={worker.name} />
      </div>
      {messages.length === 0 ? (
        <Empty icon="✉️" title="아직 주고받은 메시지가 없어요">
          아래에 쓰면 {worker.name}님 앱의 &lsquo;문의&rsquo;에 바로 보여요.
        </Empty>
      ) : (
        <ChatMessages messages={messages} viewer="admin" viewerId={admin.id} />
      )}
      {missed && (
        <Link
          href={`/admin/jobs/${missed.jobId}?tab=att&date=${kstDate()}&fix=${worker.id}#att-${worker.id}`}
          className="card flex animate-pop items-center gap-3 px-4 py-3 ring-1 ring-amber-200 transition active:scale-[0.98]"
          data-missed-fix
        >
          <span className="min-w-0 flex-1">
            <b className="block text-sm">오늘 출근 기록이 없어요</b>
            <span className="block truncate text-xs text-sub">{missed.title}</span>
          </span>
          <span className="shrink-0 text-sm font-bold text-brand-600">기록 넣기 →</span>
        </Link>
      )}
      {/* 확정 여부를 물어 온 지원자: 그 공고 지원자 탭의 그 사람으로 바로 (확정·미선발을 거기서) */}
      {waitingApp && (
        <Link
          href={`/admin/jobs/${waitingApp.jobId}?tab=apps#app-${waitingApp.appId}`}
          className="card flex animate-pop items-center gap-3 px-4 py-3 ring-1 ring-amber-200 transition active:scale-[0.98]"
          data-confirm-ask
        >
          <span className="min-w-0 flex-1">
            <b className="block text-sm">확정을 기다리는 지원이 있어요</b>
            <span className="block truncate text-xs text-sub">
              {fmtDate(waitingApp.start)} · {waitingApp.title}
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold text-brand-600">지원자 보기 →</span>
        </Link>
      )}
      <div data-vv="end" className="sticky bottom-[calc(var(--tabbar-space)+6px-var(--vv,0px))] z-10 pt-2 sm:bottom-4">
        <ChatComposer buttons={ADMIN_CHAT_BUTTONS} action={replyInquiry.bind(null, worker.id)} placeholder={`${worker.name}님에게 답장`} quickReplies={[...new Set([...(payReply ? [payReply] : []), ...repliesFor(lastAsk), ...QUICK_REPLIES])]}
        />
      </div>
    </div>
  )
}
