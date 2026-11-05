import { deleteRoomMessage, unpinRoom } from '@/app/actions/room'
import { isDeleted } from '@/lib/deleted'
import type { RoomMessage } from '@/lib/room'
import { stickerOf } from '@/lib/stickers'
import { fmtDate, kstDate, kstTime } from '@/lib/time'
import { DeletedBubble } from './Chat'
import MessageMenu from './MessageMenu'
import PinnedNudge from './PinnedNudge'
import Sticker from './Sticker'
import { ConfirmSubmit } from './ui'

type Msg = RoomMessage & { name: string }

/**
 * 단체방 말풍선: 내가 보낸 건 오른쪽, 다른 사람 건 왼쪽에 이름(담당자는 표시)과 함께.
 * 꾹 누르면(PC는 오른쪽 클릭) 복사 · 내가 쓴 건 삭제 (담당자는 방 정리를 위해 누구 글이든 삭제)
 */
export function RoomMessages({ messages, viewerId, jobId, moderator = false }: { messages: Msg[]; viewerId: string; jobId: string; moderator?: boolean }) {
  let lastDay = ''
  return (
    <ol className="space-y-2">
      {messages.map((m, i) => {
        const mine = m.sender_id === viewerId
        const day = kstDate(m.created_at)
        const showDay = day !== lastDay
        lastDay = day
        const prev = messages[i - 1]
        const showName = !mine && (showDay || !prev || prev.sender_id !== m.sender_id)
        const st = stickerOf(m.body)
        return (
          <li key={m.id}>
            {showDay && <p className="my-4 text-center text-xs font-semibold text-mute">{fmtDate(day)}</p>}
            <div className={`flex animate-pop flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {showName && (
                <span className="mb-1 ml-1 flex items-center gap-1 text-xs font-semibold text-sub">
                  {m.name}
                  {m.from_admin && <span className="rounded bg-brand-50 px-1 py-px text-[10px] font-bold text-brand-700">담당자</span>}
                </span>
              )}
              <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                {isDeleted(m.body) ? (
                  <DeletedBubble body={m.body} mine={mine} />
                ) : (
                  <MessageMenu mine={mine} copy={st ? null : m.body} remove={mine || moderator ? deleteRoomMessage.bind(null, jobId, m.id) : undefined}>
                    {st ? (
                      <Sticker id={st.id} size={120} />
                    ) : (
                      <p
                        className={`max-w-[78vw] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap sm:max-w-md ${
                          mine ? 'rounded-br-md bg-brand-600 text-white' : m.from_admin ? 'rounded-bl-md bg-brand-50 text-ink ring-1 ring-brand-100' : 'rounded-bl-md bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                        }`}
                      >
                        {m.pinned_at && <span className="mr-1">📌</span>}
                        {m.body}
                      </p>
                    )}
                  </MessageMenu>
                )}
                <span className="mb-0.5 shrink-0 text-[11px] text-mute tabular-nums">{kstTime(m.created_at)}</span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** 방 맨 위에 고정된 공지 (관리자는 내리기) */
type Reads = { seen: { id: string; name: string }[]; unseen: { id: string; name: string }[] }

export function RoomPinned({ msg, jobId, canUnpin, reads }: { msg: Msg; jobId: string; canUnpin: boolean; reads?: Reads }) {
  const st = stickerOf(msg.body)
  const total = reads ? reads.seen.length + reads.unseen.length : 0
  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[5] rounded-2xl bg-amber-50 p-3.5 text-sm shadow-sm ring-1 ring-amber-200" data-room-pinned>
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-amber-900">📌 공지</p>
        <span className="shrink-0 text-xs text-amber-800">
          {msg.name} · {fmtDate(kstDate(msg.created_at))} {kstTime(msg.created_at)}
        </span>
      </div>
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-ink">{st ? `[이모티콘] ${st.label}` : msg.body}</p>
      {/* 관리자: 근무자 중 몇 명이 공지를 봤는지 (고정된 뒤에 방을 연 사람) + 안 본 사람만 다시 알림 */}
      {reads && total > 0 && (
        <details className="mt-2.5 rounded-xl bg-white/70 p-2.5" data-pinned-reads>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-amber-900 before:hidden">
            <span className="shrink-0">👀 확인</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-amber-100">
              <span className="block h-full origin-left animate-grow rounded-full bg-amber-500" style={{ width: `${(reads.seen.length / total) * 100}%` }} />
            </span>
            <span className="shrink-0 tabular-nums" data-pinned-count>
              {reads.seen.length}/{total}명
            </span>
          </summary>
          <div className="mt-2 space-y-2 text-xs">
            {reads.unseen.length > 0 ? (
              <>
                <p className="text-amber-900">
                  아직 안 봄: <b>{reads.unseen.map((w) => w.name).join(', ')}</b>
                </p>
                <PinnedNudge jobId={jobId} count={reads.unseen.length} />
              </>
            ) : (
              <p className="font-semibold text-emerald-700">✅ 모두 확인했어요</p>
            )}
          </div>
        </details>
      )}
      {canUnpin && (
        <form action={unpinRoom.bind(null, jobId)} className="mt-2 text-right">
          <ConfirmSubmit className="btn-gray btn-sm" confirmText="공지 내릴까요?">
            공지 내리기
          </ConfirmSubmit>
        </form>
      )}
    </div>
  )
}

/** 참여자 (근무자끼리는 이름만, 번호 없음) */
export function RoomMembersInfo({ workers, admins, worker }: { workers: { id: string; name: string }[]; admins: { id: string; name: string }[]; worker: boolean }) {
  return (
    <details className="card p-3.5 text-sm">
      <summary className="cursor-pointer font-semibold text-sub">
        👥 참여 {workers.length + admins.length}명 <span className="font-normal text-mute">(근무자 {workers.length} · 담당자 {admins.length})</span>
      </summary>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {admins.map((a) => (
          <li key={a.id} className="rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700">
            {a.name} · 담당자
          </li>
        ))}
        {workers.map((w) => (
          <li key={w.id} className="rounded-full bg-bg px-2.5 py-1">
            {w.name}
          </li>
        ))}
      </ul>
      {worker && <p className="mt-2 text-xs text-mute">전화번호는 서로 보이지 않아요. 급한 일은 담당자에게 문의해 주세요.</p>}
    </details>
  )
}
