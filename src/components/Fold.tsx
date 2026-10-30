/**
 * 접었다 펴는 카드. 제목 줄을 누르면 펼쳐지고, 접혀 있을 때는 summary로 안의 내용을 한 줄 요약.
 * 폼 안에 써도 접힌 칸의 값은 그대로 함께 저장됨.
 */
export default function Fold({
  title,
  summary,
  open = false,
  id,
  badge,
  className = 'space-y-4',
  children,
}: {
  title: React.ReactNode
  summary?: React.ReactNode
  open?: boolean
  id?: string
  /** 제목 옆 작은 표시 (예: 필수, 3건) */
  badge?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <details id={id} open={open} className="fold-card group scroll-mt-32">
      <summary className="flex cursor-pointer items-center gap-3 rounded-2xl px-5 py-4 transition-colors select-none before:hidden active:bg-bg">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-bold">
            {title}
            {badge}
          </span>
          {summary && <span className="mt-0.5 block truncate text-sm text-mute group-open:hidden">{summary}</span>}
        </span>
        <svg
          viewBox="0 0 24 24"
          className="size-5 shrink-0 text-mute transition-transform duration-200 group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={`px-5 pb-5 ${className}`}>{children}</div>
    </details>
  )
}

/** 목록이 길면 앞의 몇 개만 보여 주고 나머지는 '더 보기'로 접어 둠 */
export function ShowMore({
  items,
  limit = 5,
  className = 'space-y-2',
  restClassName = className,
}: {
  items: React.ReactNode[]
  limit?: number
  className?: string
  /** 펼친 나머지를 감싸는 칸 (바깥이 카드면 카드 없이) */
  restClassName?: string
}) {
  if (items.length <= limit) return <div className={className}>{items}</div>
  return (
    <div className={className}>
      {items.slice(0, limit)}
      <details className="group">
        <summary className="cursor-pointer rounded-xl py-2.5 text-center text-sm font-semibold text-sub before:hidden active:bg-bg">
          <span className="group-open:hidden">{items.length - limit}건 더 보기 ▾</span>
          <span className="hidden group-open:inline">접기 ▴</span>
        </summary>
        <div className={restClassName}>{items.slice(limit)}</div>
      </details>
    </div>
  )
}
