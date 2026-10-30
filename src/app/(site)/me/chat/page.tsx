import type { Metadata } from 'next'
import Link from 'next/link'
import { sendInquiry } from '@/app/actions/chat'
import AutoRefresh from '@/components/AutoRefresh'
import { CHAT_MESSAGE_COLS, ChatMessages, type ChatMessage } from '@/components/Chat'
import ChatComposer, { ScrollToEnd } from '@/components/ChatComposer'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import { getJob, getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '문의' }

// 휴대폰으로 자주 보내는 문의 (누르면 입력칸에 채워짐, 고쳐서 보낼 수 있음)
const QUICK_DAY = ['조금 늦을 것 같아요. 죄송합니다.', '집결 장소가 어디인가요?', '근무 시작 버튼이 안 눌려요.', '급여 지급일이 언제인가요?']
const QUICK_JOB = ['아직 지원할 수 있나요?', '근무 시간 중 일부만 가능해요.', '식사가 제공되나요?', '주차할 수 있나요?']

export default async function ChatPage(props: PageProps<'/me/chat'>) {
  const sp = await props.searchParams
  const user = await requireUser('/me/chat')
  const jobId = typeof sp.job === 'string' && isUuid(sp.job) ? sp.job : null
  const [messages, settings, job] = await Promise.all([
    // 최근 300개 (오래된 것부터 보여 줌)
    db()
      .from('messages')
      .select(CHAT_MESSAGE_COLS)
      .eq('thread_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300)
      .then((r) => (must(r) as unknown as ChatMessage[]).sort((a, b) => a.created_at.localeCompare(b.created_at))),
    getSettings(),
    jobId ? getJob(jobId) : null,
    // 담당자 답장을 읽음으로 (보는 동안 새로 온 것도 자동 갱신 때 읽음 처리)
    db().from('messages').update({ read_at: new Date().toISOString() }).eq('thread_user_id', user.id).eq('from_admin', true).is('read_at', null),
  ])

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={5} quiet />
      <ScrollToEnd count={messages.length} />
      <div>
        <h1 className="text-2xl font-extrabold">문의</h1>
        <p className="mt-1 text-sm text-sub">궁금한 점을 남기면 담당자가 확인하고 답장해 드려요.</p>
        {settings.contact_phone && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-mute">급한 일은</span>
            <ContactButtons phone={settings.contact_phone} name={settings.contact_name ?? '담당자'} />
          </div>
        )}
      </div>

      {messages.length === 0 ? (
        <Empty icon="💬" title="아직 주고받은 메시지가 없어요">
          아래 칸에 궁금한 점을 적어 보내 주세요.
        </Empty>
      ) : (
        <ChatMessages messages={messages} viewer="worker" />
      )}

      {/* 휴대폰은 아래 탭 위에, 넓은 화면은 화면 아래에 붙어 있음 */}
      <div className="sticky bottom-[calc(69px+env(safe-area-inset-bottom))] z-10 pt-2 sm:bottom-4">
        <ChatComposer
          action={sendInquiry.bind(null, job?.id ?? null)}
          placeholder="담당자에게 보낼 내용"
          quickReplies={job ? QUICK_JOB : QUICK_DAY}
          context={
            job && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-sub">
                <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-line">📌 {job.title}</span>
                에 대한 문의
                <Link href="/me/chat" className="ml-auto text-mute underline">
                  공고 빼기
                </Link>
              </p>
            )
          }
        />
      </div>
    </div>
  )
}
