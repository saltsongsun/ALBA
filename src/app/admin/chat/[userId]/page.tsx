import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { replyInquiry } from '@/app/actions/chat'
import { CHAT_BUTTONS } from '@/lib/chatButtons'
import AutoRefresh from '@/components/AutoRefresh'
import Avatar from '@/components/Avatar'
import { CHAT_MESSAGE_COLS, ChatMessages, type ChatMessage } from '@/components/Chat'
import ChatComposer, { ScrollToEnd } from '@/components/ChatComposer'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import ReadSync from '@/components/ReadSync'
import { db, must } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { workerInCompany } from '@/lib/company'
import { parsePayday, SIGNAL } from '@/lib/signals'
import { paydayLabel } from '@/lib/payday'
import { isUuid } from '@/lib/validate'

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
  return []
}

export default async function AdminChatThread(props: PageProps<'/admin/chat/[userId]'>) {
  const admin = await requireAdmin()
  const { userId } = await props.params
  if (!isUuid(userId)) notFound()
  const [{ data: worker }, messages] = await Promise.all([
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
  ])
  // 이 회사에 문의했거나 지원한 근무자만
  if (!worker || (!messages.length && !(await workerInCompany(admin.companyId, userId)))) notFound()

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

  return (
    <div className="mx-auto max-w-2xl space-y-4">
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
      <div className="card flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-3">
          <Avatar id={worker.id} name={worker.name} photoAt={worker.photo_at} />
          <Link href={`/admin/workers/${worker.id}`} className="text-lg font-bold hover:text-brand-600">
            {worker.name}
          </Link>
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
      <div data-vv="end" className="sticky bottom-[calc(var(--tabbar-space)+6px-var(--vv,0px))] z-10 pt-2 sm:bottom-4">
        <ChatComposer buttons={CHAT_BUTTONS} action={replyInquiry.bind(null, worker.id)} placeholder={`${worker.name}님에게 답장`} quickReplies={[...new Set([...(payReply ? [payReply] : []), ...repliesFor(lastAsk), ...QUICK_REPLIES])]}
        />
      </div>
    </div>
  )
}
