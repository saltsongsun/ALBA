import Link from 'next/link'

/**
 * 결과가 늦어 회사에서 정중한 기다림 안내(🙏 지원 결과 안내)를 보냈으면: 근무자의 확정 대기 칸에 한 줄.
 * 누르면 그 회사 문의함에서 받은 안내를 다시 봄 (같은 걸 또 묻지 않게 · 안 읽었으면 '새')
 */
export default function WaitNoteLine({ companyId, unread, className = 'mt-2.5' }: { companyId: string; unread: boolean; className?: string }) {
  return (
    <Link
      href={`/me/chat?co=${companyId}`}
      className={`flex min-h-10 items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2 text-[13px] transition active:scale-[0.98] ${className}`}
      data-wait-note={unread ? 'new' : 'read'}
    >
      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-sub">
        <span aria-hidden>🙏</span>
        <span className="truncate">기다림 안내를 받았어요</span>
        {unread && <span className="badge shrink-0 animate-pop bg-brand-50 text-brand-700">새</span>}
      </span>
      <span className="shrink-0 font-bold whitespace-nowrap text-brand-700">보기 →</span>
    </Link>
  )
}
