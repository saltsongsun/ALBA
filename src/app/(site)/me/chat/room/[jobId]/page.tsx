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
import { fmtDateRange, kstDate } from '@/lib/time'
import Icon from '@/components/Icon'
import { getJob } from '@/lib/data'
import { db } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { phoneFmt } from '@/lib/format'
import { mapLinks } from '@/lib/map'

export const metadata: Metadata = { title: '단체방' }

/** 같은 근무 단체방 (근무자): 그 공고에 확정된 사람만 */
export default async function WorkerRoomPage(props: PageProps<'/me/chat/room/[jobId]'>) {
  const { jobId } = await props.params
  const user = await requireUser(`/me/chat/room/${jobId}`)
  const job = await workerRoom(user.id, jobId)
  // 관리자는 맡은 회사 방이면 관리자 단체방으로 · 다른 회사에서 근무자로 확정된 방이면 근무자로 (한 계정으로 두 역할)
  if (user.role === 'admin' && (!job || (await canManageCompany(user, job.company_id)))) redirect(`/admin/chat/room/${jobId}`)
  if (!job) notFound()
  // 근무 정보 한 줄 (끝나지 않은 행사만): 시간·장소·집결 + 길찾기·담당 전화 — 방에서 '몇 시까지예요? 어디로 가요?'를 묻지 않게
  const live = job.end_date >= kstDate()
  const [messages, members, pinned, reads, , full, co] = await Promise.all([
    roomMessages(job.id),
    roomMembers(job),
    roomPinned(job.id),
    roomReads(job.id),
    markRoomRead(job.id, user.id),
    live ? getJob(job.id).catch(() => null) : null,
    live
      ? db()
          .from('companies')
          .select('contact_phone, company_phone')
          .eq('id', job.company_id)
          .maybeSingle()
          .then(
            (r) => r.data as { contact_phone: string | null; company_phone: string | null } | null,
            () => null,
          )
      : null,
  ])
  const open = roomOpen(job)
  const map = full ? mapLinks({ name: full.location_name, address: full.address, lat: full.lat, lng: full.lng }) : null
  // 현장 담당 번호가 없으면 회사 문의 번호 (확정된 근무자만 들어오는 방)
  const phone = full ? full.manager_phone || co?.contact_phone || co?.company_phone || null : null

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={5} quiet pulse={`/api/pulse?s=room&id=${job.id}`} />
      <ScrollToEnd count={messages.length} />
      <ReadSync tag={`room-${job.id}`} />
      <div className="flex items-center justify-between gap-2">
        <Link href="/me/chat" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 문의
        </Link>
        <a href={`/me/chat/room/${job.id}/export`} download className="chip h-8 px-3 text-xs">
          ⬇️ 대화 저장
        </a>
      </div>
      <div className="space-y-1.5">
        <h1 className="truncate text-xl font-extrabold">👥 {job.title}</h1>
        {full ? (
          <>
            <p className="truncate text-sm text-sub" data-room-facts>
              {fmtDateRange(job.start_date, job.end_date)} {scheduleText(full)}
              {full.location_name && ` · ${full.location_name}`}
            </p>
            {full.meeting_point && (
              <p className="truncate text-sm text-sub" data-room-meeting>
                <Icon name="flag" className="text-mute" /> 집결 {full.meeting_point}
              </p>
            )}
            {(map || phone) && (
              <div className="flex flex-wrap gap-1.5" data-room-tools>
                {map && (
                  <a href={map.route ?? map.kakao} target="_blank" rel="noreferrer" className="chip h-8 px-3 text-xs">
                    <Icon name="route" /> {map.route ? '길찾기' : '지도'}
                  </a>
                )}
                {phone && (
                  <a href={`tel:${phone.replace(/\D/g, '')}`} className="chip h-8 px-3 text-xs" aria-label={`담당 전화 ${phoneFmt(phone)}`}>
                    <Icon name="phone" /> 담당 전화
                  </a>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-sub">{fmtDateRange(job.start_date, job.end_date)} · 같은 근무 단체방</p>
        )}
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
            // 아직 대화가 없는 방: 첫 인사를 한 번에 (누르면 입력 칸에 들어가고, 고쳐서 보낼 수 있음)
            quickReplies={messages.length === 0 ? ['안녕하세요, 잘 부탁드려요!', '처음이라 잘 부탁드립니다.', '같이 가실 분 계신가요?'] : []}
            mentions={[...members.workers.filter((w) => w.id !== user.id), ...members.admins.map((a) => ({ ...a, admin: true }))]}
          />
        ) : (
          <p className="card text-center text-sm text-sub">행사가 끝나 대화가 닫혔어요. 대화 저장은 할 수 있어요.</p>
        )}
      </div>
    </div>
  )
}
