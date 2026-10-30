import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { replyInquiry } from '@/app/actions/chat'
import AutoRefresh from '@/components/AutoRefresh'
import Avatar from '@/components/Avatar'
import { CHAT_MESSAGE_COLS, ChatMessages, type ChatMessage } from '@/components/Chat'
import ChatComposer, { ScrollToEnd } from '@/components/ChatComposer'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import { db, must } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '문의 대화' }

const QUICK_REPLIES = ['확인했습니다.', '담당자가 곧 전화드릴게요.', '앱의 내 근무 화면에서 확인해 주세요.', '감사합니다!']

export default async function AdminChatThread(props: PageProps<'/admin/chat/[userId]'>) {
  await requireAdmin()
  const { userId } = await props.params
  if (!isUuid(userId)) notFound()
  const [{ data: worker }, messages] = await Promise.all([
    db().from('users').select('id, name, phone, photo_at').eq('id', userId).maybeSingle(),
    db()
      .from('messages')
      .select(CHAT_MESSAGE_COLS)
      .eq('thread_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(300)
      .then((r) => (must(r) as unknown as ChatMessage[]).sort((a, b) => a.created_at.localeCompare(b.created_at))),
    // 근무자 문의를 읽음으로 (어느 관리자가 보든 한 번 읽으면 읽음)
    db().from('messages').update({ read_at: new Date().toISOString() }).eq('thread_user_id', userId).eq('from_admin', false).is('read_at', null),
  ])
  if (!worker) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <AutoRefresh seconds={5} quiet />
      <ScrollToEnd count={messages.length} />
      <Link href="/admin/chat" className="text-sm font-semibold text-sub">
        ← 문의 목록
      </Link>
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
        <Empty icon="✉️" title="아직 주고받은 메시지가 없습니다">
          아래에 쓰면 {worker.name}님의 앱 &lsquo;문의&rsquo;에 표시됩니다.
        </Empty>
      ) : (
        <ChatMessages messages={messages} viewer="admin" />
      )}
      <div className="sticky bottom-4 z-10 pt-2">
        <ChatComposer action={replyInquiry.bind(null, worker.id)} placeholder={`${worker.name}님에게 답장`} quickReplies={QUICK_REPLIES} />
      </div>
    </div>
  )
}
