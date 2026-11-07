import Link from 'next/link'
import { deleteMessage } from '@/app/actions/chat'
import { deletedText, isDeleted } from '@/lib/deleted'
import { SIGNAL, signalOf } from '@/lib/signals'
import { plainBody, stickerOf } from '@/lib/stickers'
import { splitButtons, type ChatButton } from '@/lib/chatButtons'
import Icon from './Icon'
import { linkify } from './Linkify'
import MessageMenu from './MessageMenu'
import Sticker from './Sticker'
import { fmtDate, kstDate, kstTime } from '@/lib/time'

/** 대화 화면에서 메시지를 읽을 때의 select (공고 제목·보낸 사람 이름 포함) */
export const CHAT_MESSAGE_COLS = 'id, from_admin, sender_id, body, created_at, read_at, job:jobs(id, title), sender:users!messages_sender_id_fkey(name)'

export type ChatMessage = {
  id: number
  from_admin: boolean
  sender_id: string | null
  body: string
  created_at: string
  read_at: string | null
  job: { id: string; title: string } | null
  sender: { name: string } | null
}

/**
 * 근무자가 보낸 현장 알림·요청을 관리자가 바로 처리할 화면 (그 공고의 출퇴근·지원자 탭, 그 날짜).
 * 해당하지 않는 일반 문의면 null
 */
export function adminActionFor(m: Pick<ChatMessage, 'from_admin' | 'body' | 'created_at' | 'job'>): { href: string; label: string } | null {
  if (m.from_admin || !m.job) return null
  const head = m.body.split('\n', 1)[0]
  const base = `/admin/jobs/${m.job.id}`
  const sent = kstDate(m.created_at)
  // 본문의 'M/D(요일)' → 날짜 (연도는 보낸 날에 맞춤, 연말·연초 넘어가는 것 고려)
  const mdDate = () => {
    const x = m.body.match(/(\d{1,2})\/(\d{1,2})\(/)
    if (!x) return null
    const mo = Number(x[1])
    const sentMo = Number(sent.slice(5, 7))
    const y = Number(sent.slice(0, 4)) + (mo < sentMo - 6 ? 1 : mo > sentMo + 6 ? -1 : 0)
    return `${y}-${String(mo).padStart(2, '0')}-${String(Number(x[2])).padStart(2, '0')}`
  }
  const att = (d: string | null) => ({ href: `${base}?tab=att${d ? `&date=${d}` : ''}`, label: '출퇴근 탭에서 처리 →' })
  if ([SIGNAL.late, SIGNAL.arrive, SIGNAL.fix].some((s) => head.startsWith(s))) return att(sent)
  if (head.startsWith('🕒 근무 종료 늦게 입력') || head.startsWith('⚠️ 근무시간')) return att(mdDate())
  if (head.startsWith('⚠️ 근무일 취소')) {
    const d = mdDate()
    return { href: `${base}?tab=apps${d ? `&day=${d}` : ''}`, label: '빈자리 채우기 →' }
  }
  if (head.startsWith('⚠️ 확정 취소')) return { href: `${base}?tab=apps`, label: '빈자리 채우기 →' }
  return null
}

/**
 * 문의 대화 말풍선. 보는 사람(근무자/관리자)이 보낸 건 오른쪽 파란색, 받은 건 왼쪽 흰색.
 * 날짜가 바뀌면 구분선, 상대가 아직 안 읽은 내 메시지에는 '1'.
 * 말풍선을 꾹 누르면(PC는 오른쪽 클릭) 복사 · 내가 쓴 건 삭제 (앱이 보낸 현장 알림·요청은 기록이라 삭제 없음)
 */
export function ChatMessages({
  messages,
  viewer,
  viewerId,
  clock,
}: {
  messages: ChatMessage[]
  viewer: 'worker' | 'admin'
  viewerId: string
  /** 근무자 화면: 담당자가 보낸 마지막 '근무 시작·종료' 버튼 자리에 넣을 진짜 근무 버튼 (채팅에서 바로 누름) */
  clock?: React.ReactNode
}) {
  let lastDay = ''
  // 진짜 근무 버튼은 맨 마지막 '근무 시작·종료' 버튼 메시지 아래 한 곳에만 (예전 것은 바로 가기 링크로)
  const clockAt = clock
    ? messages.findLastIndex((m) => m.from_admin && !isDeleted(m.body) && splitButtons(m.body).buttons.some((b) => CLOCK_KEYS.includes(b.key)))
    : -1
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
        // 담당자가 보낸 바로 가기 버튼: 글 아래 버튼으로 (근무자가 쓴 버튼 모양 글은 버튼으로 바꾸지 않음)
        const { text, buttons } = m.from_admin && !isDeleted(m.body) ? splitButtons(m.body) : { text: m.body, buttons: [] as ChatButton[] }
        return (
          <li key={m.id}>
            {showDay && <p className="my-4 text-center text-xs font-semibold text-mute">{fmtDate(day)}</p>}
            <div className={`flex animate-pop flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {showName && <span className="mb-1 ml-1 text-xs font-semibold text-sub">{m.sender?.name ?? (m.from_admin ? '담당자' : '근무자')}</span>}
              {m.job && (
                // 관리자는 그 공고의 관리 화면으로
                <Link
                  href={viewer === 'admin' ? `/admin/jobs/${m.job.id}` : `/jobs/${m.job.id}`}
                  className="mb-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-sub ring-1 ring-line active:bg-bg"
                >
                  📌 {m.job.title} <span className="text-brand-600">공고 보기 ›</span>
                </Link>
              )}
              <div className={`flex items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                {isDeleted(m.body) ? (
                  <DeletedBubble body={m.body} mine={mine} />
                ) : (
                  <MessageMenu
                    mine={mine}
                    copy={stickerOf(m.body) ? null : plainBody(m.body)}
                    remove={m.sender_id === viewerId && !signalOf(m.body) ? deleteMessage.bind(null, m.id) : undefined}
                  >
                    {stickerOf(m.body) ? (
                      // 이모티콘은 말풍선 없이 그림으로
                      <Sticker id={stickerOf(m.body)!.id} size={120} />
                    ) : (
                      <p
                        className={`max-w-[78vw] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap sm:max-w-md ${
                          mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                        }`}
                      >
                        {/* 주소·휴대폰 번호는 눌러서 열기·전화 */}
                        {linkify(text, mine)}
                      </p>
                    )}
                  </MessageMenu>
                )}
                <span className="mb-0.5 shrink-0 text-[11px] text-mute tabular-nums">
                  {mine && !m.read_at && <b className="mr-1 text-brand-600">1</b>}
                  {kstTime(m.created_at)}
                </span>
              </div>
              {buttons.length > 0 && <ChatButtons buttons={buttons} live={viewer === 'worker'} clock={i === clockAt ? clock : undefined} />}
              {/* 근무자의 현장 알림·요청: 처리할 화면으로 바로 */}
              {viewer === 'admin' &&
                (() => {
                  const act = adminActionFor(m)
                  return act ? (
                    <Link href={act.href} className="chip-primary mt-1.5 h-8 px-3 text-xs">
                      {act.label}
                    </Link>
                  ) : null
                })()}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * 담당자가 보낸 바로 가기 버튼 (말풍선 아래). 근무자: 누르면 그 화면으로 · 담당자: 어떻게 보이는지만 (누를 수 없음)
 */
const CLOCK_KEYS = ['clock-in', 'clock-out']

function ChatButtons({ buttons, live, clock }: { buttons: ChatButton[]; live: boolean; clock?: React.ReactNode }) {
  // 근무 시작·종료 버튼이 둘 다 있어도 진짜 근무 버튼은 한 번만
  const shown = clock ? buttons.filter((b, i) => !CLOCK_KEYS.includes(b.key) || buttons.findIndex((x) => CLOCK_KEYS.includes(x.key)) === i) : buttons
  return (
    <div className={`mt-1.5 flex max-w-[78vw] flex-col gap-1.5 sm:max-w-md ${live ? 'items-start' : 'items-end'}`}>
      {shown.map((b) =>
        clock && CLOCK_KEYS.includes(b.key) ? (
          <div key={b.key}>{clock}</div>
        ) : live ? (
          <Link
            key={b.key}
            href={b.href}
            data-chat-button={b.key}
            className="flex animate-pop items-center gap-2 rounded-2xl bg-brand-600 py-2.5 pr-3.5 pl-3 text-[15px] font-bold text-white shadow-sm transition active:scale-95"
          >
            <Icon name={b.icon} className="shrink-0 text-lg" />
            <span className="min-w-0 truncate">{b.label}</span>
            <span aria-hidden className="shrink-0 opacity-80">›</span>
          </Link>
        ) : (
          <span
            key={b.key}
            data-chat-button={b.key}
            title="근무자 화면에서는 누르는 버튼으로 보여요"
            className="flex items-center gap-2 rounded-2xl bg-white py-2 pr-3.5 pl-3 text-sm font-bold text-brand-700 ring-1 ring-brand-200"
          >
            <Icon name={b.icon} className="shrink-0" />
            <span className="min-w-0 truncate">{b.label}</span>
            <span className="shrink-0 rounded bg-brand-50 px-1 text-[10px] font-bold text-brand-600">버튼</span>
          </span>
        ),
      )}
    </div>
  )
}

/** 지운 메시지 자리 (대화 흐름은 그대로 두고 글은 보이지 않음) */
export function DeletedBubble({ body, mine }: { body: string; mine: boolean }) {
  return (
    <p data-deleted-msg className={`flex items-center gap-1.5 rounded-2xl bg-white/70 px-3.5 py-2.5 text-[14px] text-mute ring-1 ring-line ${mine ? 'rounded-br-md' : 'rounded-bl-md'}`}>
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M6 18L18 6" />
      </svg>
      {deletedText(body)}
    </p>
  )
}
