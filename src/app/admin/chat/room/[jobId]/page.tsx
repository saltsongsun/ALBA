import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { joinRoom, leaveRoom, sendRoom } from '@/app/actions/room'
import AutoRefresh from '@/components/AutoRefresh'
import ChatComposer, { ScrollToEnd } from '@/components/ChatComposer'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import ReadSync from '@/components/ReadSync'
import { RoomMembersInfo, RoomMessages, RoomPinned } from '@/components/Room'
import { companyJob } from '@/lib/company'
import { adminJoined, markRoomRead, pinnedReads, roomMembers, roomMessages, roomOpen, roomPinned, roomReads } from '@/lib/room'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { requireAdmin } from '@/lib/session'
import { fmtDateRange } from '@/lib/time'

export const metadata: Metadata = { title: '단체방' }

/** 같은 근무 단체방 (관리자): 이 회사 공고만. 글을 '공지로 고정'할 수 있음 */
export default async function AdminRoomPage(props: PageProps<'/admin/chat/room/[jobId]'>) {
  const admin = await requireAdmin()
  const [{ jobId }, sp] = await Promise.all([props.params, props.searchParams])
  const job = await companyJob(admin, jobId)
  if (!job) notFound()
  // 관리자는 '공고를 올린 사람 + 방에 들어온 사람'만 참여 — 참여 전에는 읽기만 (읽음 표시도 남기지 않아 참여로 치지 않음)
  const joined = await adminJoined(job, admin.id)
  const creator = job.created_by === admin.id
  const [messages, members, pinned, readMap] = await Promise.all([roomMessages(job.id), roomMembers(job), roomPinned(job.id), roomReads(job.id), joined ? markRoomRead(job.id, admin.id) : null])
  const open = roomOpen(job)
  const reads = pinned?.pinned_at ? await pinnedReads(job.id, pinned.pinned_at, members.workers) : undefined

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Flash m={sp.m} />
      <AutoRefresh seconds={5} quiet pulse={`/api/pulse?s=room&id=${job.id}`} />
      <ScrollToEnd count={messages.length} />
      <ReadSync tag={`room-${job.id}`} />
      <div className="flex items-center justify-between gap-2">
        <Link href="/admin/chat" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 문의 목록
        </Link>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* 나가기는 위 줄에 (제목 줄이 두 줄로 밀리지 않게) · 공고를 올린 관리자는 늘 참여 */}
          {joined && !creator && (
            <form action={leaveRoom.bind(null, job.id)} data-room-leave>
              <ConfirmSubmit className="chip h-8 px-3 text-xs" confirmText="한 번 더 누르면 나가요">
                나가기
              </ConfirmSubmit>
            </form>
          )}
          <a href={`/admin/chat/room/${job.id}/export`} download className="chip h-8 px-3 text-xs">
            ⬇️ 대화 저장
          </a>
        </span>
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
      {/* 참여 전: 읽기만 · 참여하면 알림·안 읽은 수·@부르기 대상 */}
      {!joined && (
        <div className="flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 ring-1 ring-brand-100" data-room-join>
          <p className="min-w-0 flex-1 text-sm text-brand-700">
            <b className="block">이 단체방에 참여하지 않았어요</b>
            <span className="text-[13px] text-sub">참여하면 새 메시지 알림을 받아요</span>
          </p>
          <form action={joinRoom.bind(null, job.id)}>
            <SubmitButton className="btn-primary btn-sm shrink-0" pendingText="참여 중…">
              참여하기
            </SubmitButton>
          </form>
        </div>
      )}
      <RoomMembersInfo workers={members.workers} admins={members.admins} worker={false} />
      {pinned && <RoomPinned msg={pinned} jobId={job.id} canUnpin reads={reads} />}
      {messages.length === 0 ? (
        <Empty icon="📢" title="아직 대화가 없어요">
          집합 장소·복장 같은 안내를 올리고 &lsquo;공지로 고정&rsquo;해 보세요
        </Empty>
      ) : (
        <RoomMessages messages={messages} viewerId={admin.id} jobId={job.id} moderator members={members} reads={readMap} />
      )}
      <div data-vv="end" className="sticky bottom-[calc(var(--tabbar-space)+6px-var(--vv,0px))] z-10 pt-2 sm:bottom-4">
        {open ? (
          <ChatComposer
            action={sendRoom.bind(null, job.id)}
            placeholder="모두에게 보낼 메시지"
            mentions={[...members.workers, ...members.admins.filter((p) => p.id !== admin.id).map((p) => ({ ...p, admin: true }))]}
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
