import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { sendRoom } from '@/app/actions/room'
import AutoRefresh from '@/components/AutoRefresh'
import ChatComposer, { ScrollToEnd } from '@/components/ChatComposer'
import Empty from '@/components/Empty'
import ReadSync from '@/components/ReadSync'
import { RoomMembersInfo, RoomMessages, RoomPinned } from '@/components/Room'
import { markRoomRead, roomMembers, roomMessages, roomOpen, roomPinned, roomReads, workerRoom } from '@/lib/room'
import { canManageCompany, requireUser } from '@/lib/session'
import { fmtDateRange } from '@/lib/time'

export const metadata: Metadata = { title: '단체방' }

/** 같은 근무 단체방 (근무자): 그 공고에 확정된 사람만 */
export default async function WorkerRoomPage(props: PageProps<'/me/chat/room/[jobId]'>) {
  const { jobId } = await props.params
  const user = await requireUser(`/me/chat/room/${jobId}`)
  const job = await workerRoom(user.id, jobId)
  // 관리자는 맡은 회사 방이면 관리자 단체방으로 · 다른 회사에서 근무자로 확정된 방이면 근무자로 (한 계정으로 두 역할)
  if (user.role === 'admin' && (!job || (await canManageCompany(user, job.company_id)))) redirect(`/admin/chat/room/${jobId}`)
  if (!job) notFound()
  const [messages, members, pinned, reads] = await Promise.all([roomMessages(job.id), roomMembers(job), roomPinned(job.id), roomReads(job.id), markRoomRead(job.id, user.id)])
  const open = roomOpen(job)

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={5} quiet pulse={`/api/pulse?s=room&id=${job.id}`} />
      <ScrollToEnd count={messages.length} />
      <ReadSync tag={`room-${job.id}`} />
      <div className="flex items-center justify-between gap-2">
        <Link href="/me/chat" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 문의
        </Link>
        <a href={`/me/chat/room/${job.id}/export`} download className="chip h-8 px-3 text-xs">
          ⬇️ 대화 저장
        </a>
      </div>
      <div>
        <h1 className="truncate text-xl font-extrabold">👥 {job.title}</h1>
        <p className="text-sm text-sub">{fmtDateRange(job.start_date, job.end_date)} · 같은 근무 단체방</p>
      </div>
      <RoomMembersInfo workers={members.workers} admins={members.admins} worker />
      {pinned && <RoomPinned msg={pinned} jobId={job.id} canUnpin={false} />}
      {messages.length === 0 ? (
        <Empty icon="👋" sticker="hi" title="아직 대화가 없어요">
          같이 일할 분들께 먼저 인사해 보세요
        </Empty>
      ) : (
        <RoomMessages messages={messages} viewerId={user.id} jobId={job.id} members={members} reads={reads} />
      )}
      <div data-vv="end" className="sticky bottom-[calc(var(--tabbar-space)+6px-var(--vv,0px))] z-10 pt-2 sm:bottom-4">
        {open ? (
          <ChatComposer
            action={sendRoom.bind(null, job.id)}
            placeholder="모두에게 보낼 메시지"
            mentions={[...members.workers.filter((w) => w.id !== user.id), ...members.admins.map((a) => ({ ...a, admin: true }))]}
          />
        ) : (
          <p className="card text-center text-sm text-sub">행사가 끝나 대화가 닫혔어요. 대화 저장은 할 수 있어요.</p>
        )}
      </div>
    </div>
  )
}
