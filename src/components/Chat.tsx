import { fmtDate, kstDate, kstTime } from '@/lib/time'

/** 대화 화면에서 메시지를 읽을 때의 select (공고 제목·보낸 사람 이름 포함) */
export const CHAT_MESSAGE_COLS = 'id, from_admin, body, created_at, read_at, job:jobs(id, title), sender:users!messages_sender_id_fkey(name)'

export type ChatMessage = {
  id: number
  from_admin: boolean
  body: string
  created_at: string
  read_at: string | null
  job: { id: string; title: string } | null
  sender: { name: string } | null
}

/**
 * 문의 대화 말풍선. 보는 사람(근무자/관리자)이 보낸 건 오른쪽 파란색, 받은 건 왼쪽 흰색.
 * 날짜가 바뀌면 구분선, 상대가 아직 안 읽은 내 메시지에는 '1'.
 */
export function ChatMessages({ messages, viewer }: { messages: ChatMessage[]; viewer: 'worker' | 'admin' }) {
  let lastDay = ''
  return (
    <ol className="space-y-2">
      {messages.map((m, i) => {
        const mine = viewer === 'admin' ? m.from_admin : !m.from_admin
        const day = kstDate(m.created_at)
        const showDay = day !== lastDay
        lastDay = day
        // 같은 사람이 이어서 보낸 말풍선에는 이름을 다시 쓰지 않음
        const prev = messages[i - 1]
        const showName = !mine && (showDay || !prev || prev.from_admin !== m.from_admin || prev.sender?.name !== m.sender?.name)
        return (
          <li key={m.id}>
            {showDay && <p className="my-4 text-center text-xs font-semibold text-mute">{fmtDate(day)}</p>}
            <div className={`flex animate-pop flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {showName && <span className="mb-1 ml-1 text-xs font-semibold text-sub">{m.sender?.name ?? (m.from_admin ? '담당자' : '근무자')}</span>}
              {m.job && <span className="mb-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-sub ring-1 ring-line">📌 {m.job.title}</span>}
              <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                <p
                  className={`max-w-[78vw] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap sm:max-w-md ${
                    mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                  }`}
                >
                  {m.body}
                </p>
                <span className="mb-0.5 shrink-0 text-[11px] text-mute tabular-nums">
                  {mine && !m.read_at && <b className="mr-1 text-brand-600">1</b>}
                  {kstTime(m.created_at)}
                </span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
