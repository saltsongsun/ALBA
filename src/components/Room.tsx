import { unpinRoom } from '@/app/actions/room'
import type { RoomMessage } from '@/lib/room'
import { stickerOf } from '@/lib/stickers'
import { fmtDate, kstDate, kstTime } from '@/lib/time'
import Sticker from './Sticker'
import { ConfirmSubmit } from './ui'

type Msg = RoomMessage & { name: string }

/** 단체방 말풍선: 내가 보낸 건 오른쪽, 다른 사람 건 왼쪽에 이름(담당자는 표시)과 함께 */
export function RoomMessages({ messages, viewerId }: { messages: Msg[]; viewerId: string }) {
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
export function RoomPinned({ msg, jobId, canUnpin }: { msg: Msg; jobId: string; canUnpin: boolean }) {
  const st = stickerOf(msg.body)
  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[5] rounded-2xl bg-amber-50 p-3.5 text-sm shadow-sm ring-1 ring-amber-200" data-room-pinned>
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-amber-900">📌 공지</p>
        <span className="shrink-0 text-xs text-amber-800">
          {msg.name} · {fmtDate(kstDate(msg.created_at))} {kstTime(msg.created_at)}
        </span>
      </div>
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-ink">{st ? `[이모티콘] ${st.label}` : msg.body}</p>
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
