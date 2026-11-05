import { seenText } from '@/lib/format'

/** 근무자 접속 여부 (최고 관리자 화면에서만 씀): 초록 점 '접속 중' · 'N분 전 접속' */
export default function Presence({ iso, now, empty }: { iso: string | null | undefined; now?: number; empty?: string }) {
  const s = seenText(iso, now)
  if (!s) return empty ? <span className="badge bg-gray-100 text-mute" data-presence="none">{empty}</span> : null
  return s.online ? (
    <span className="badge bg-emerald-50 text-emerald-700" data-presence="online">
      <span aria-hidden className="relative inline-flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      {s.text}
    </span>
  ) : (
    <span className="badge bg-gray-100 text-mute" data-presence="away">
      {s.text}
    </span>
  )
}
