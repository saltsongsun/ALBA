import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sendRoom } from '@/app/actions/room'
import AutoRefresh from '@/components/AutoRefresh'
import ChatComposer, { ScrollToEnd } from '@/components/ChatComposer'
import Empty from '@/components/Empty'
import ReadSync from '@/components/ReadSync'
import { RoomMembersInfo, RoomMessages, RoomPinned } from '@/components/Room'
import { companyJob } from '@/lib/company'
import { markRoomRead, pinnedReads, roomMembers, roomMessages, roomOpen, roomPinned } from '@/lib/room'
import { requireAdmin } from '@/lib/session'
import { fmtDateRange } from '@/lib/time'

export const metadata: Metadata = { title: '단체방' }

/** 같은 근무 단체방 (관리자): 이 회사 공고만. 글을 '공지로 고정'할 수 있음 */
export default async function AdminRoomPage(props: PageProps<'/admin/chat/room/[jobId]'>) {
  const admin = await requireAdmin()
  const { jobId } = await props.params
  const job = await companyJob(admin, jobId)
  if (!job) notFound()
  const [messages, members, pinned] = await Promise.all([roomMessages(job.id), roomMembers(job), roomPinned(job.id), markRoomRead(job.id, admin.id)])
  const open = roomOpen(job)
  const reads = pinned?.pinned_at ? await pinnedReads(job.id, pinned.pinned_at, members.workers) : undefined

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <AutoRefresh seconds={5} quiet />
      <ScrollToEnd count={messages.length} />
      <ReadSync tag={`room-${job.id}`} />
      <div className="flex items-center justify-between gap-2">
        <Link href="/admin/chat" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 문의 목록
        </Link>
        <a href={`/admin/chat/room/${job.id}/export`} download className="chip h-8 px-3 text-xs">
          ⬇️ 대화 저장
        </a>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold">👥 {job.title}</h1>
          <p className="text-sm text-sub">{fmtDateRange(job.start_date, job.end_date)} · 확정자 단체방</p>
        </div>
        <Link href={`/admin/jobs/${job.id}`} className="shrink-0 text-sm font-semibold text-brand-600">
          공고 관리 →
        </Link>
      </div>
      <RoomMembersInfo workers={members.workers} admins={members.admins} worker={false} />
      {pinned && <RoomPinned msg={pinned} jobId={job.id} canUnpin reads={reads} />}
      {messages.length === 0 ? (
        <Empty icon="📢" title="아직 대화가 없어요">
          집합 장소·복장 같은 안내를 올리고 &lsquo;공지로 고정&rsquo;해 보세요
        </Empty>
      ) : (
        <RoomMessages messages={messages} viewerId={admin.id} />
      )}
      <div className="sticky bottom-4 z-10 pt-2">
        {open ? (
          <ChatComposer
            action={sendRoom.bind(null, job.id)}
            placeholder="확정자 모두에게 보낼 메시지"
            extra={
              <label className="flex items-center gap-2 px-2 text-sm text-sub">
                <input type="checkbox" name="pin" className="size-4 accent-brand-600" />
                📌 공지로 고정 (방 맨 위에 보여요)
              </label>
            }
          />
        ) : (
          <p className="card text-center text-sm text-sub">행사가 끝나고 7일이 지나 대화가 닫혔어요. 대화 저장은 할 수 있어요.</p>
        )}
      </div>
    </div>
  )
}
