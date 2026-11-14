import { ackNotice } from '@/app/actions/worker'
import { parseChanges } from '@/lib/signals'
import { SubmitButton } from './ui'

/** 근무자에게 온 담당자 글 하나 (공지 · 일정 변경) */
export type Notice = { id: number | string; job_id: string; body: string; created_at: string; read_at: string | null }

/** 공지 머리줄 표시: 안 읽었으면 '새' · 방금(1분 안) 확인했으면 '✓ 확인함'이 톡 · 그 뒤로는 조용히 '✓ 확인함' */
export function AckMark({ n }: { n: Notice }) {
  if (!n.read_at) return <span className="animate-pop rounded-full bg-rose-500 px-1.5 py-px text-[10px] leading-4 font-bold text-white" data-notice-new>새</span>
  const just = Date.now() - Date.parse(n.read_at) < 60_000
  return (
    <span className={`text-[11px] font-semibold text-emerald-700 ${just ? 'animate-pop' : ''}`} data-notice-acked={just ? 'just' : ''}>
      ✓ 확인함
    </span>
  )
}

/** 그 자리에서 바로 '확인했어요' (문의함을 안 열어도 담당자 화면 '읽음'에 들어감) — 안 읽은 글에만 */
export function AckButton({ n }: { n: Notice }) {
  if (n.read_at) return null
  return (
    <form action={ackNotice.bind(null, n.id)} className="-mt-1 flex justify-end px-3 pb-2.5">
      <SubmitButton className="chip h-8 bg-white px-3 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200" pendingText="확인 중…" track="공지 확인했어요">
        ✓ 확인했어요
      </SubmitButton>
    </form>
  )
}

/** '🔔 일정 변경'에서 바뀐 것: 한 줄씩 '시간 ~~09:00~18:00~~ → 10:00~18:00' · 모양을 모르면 '공고에서 확인해 주세요' */
export function ChangeRows({ body, fallback = '공고에서 확인해 주세요' }: { body: string; fallback?: string }) {
  const ch = parseChanges(body)
  if (!ch.length) return <span className="mt-0.5 block text-sub">{fallback}</span>
  return ch.slice(0, 4).map((c) => (
    <span key={c.label} className="mt-0.5 block truncate" data-change-row>
      <span className="font-semibold text-amber-800">{c.label}</span> <s className="text-mute">{c.from}</s> → <b className="font-bold text-ink">{c.to}</b>
    </span>
  ))
}
