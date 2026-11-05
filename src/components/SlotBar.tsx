/** 칸이 이보다 많으면 칸이 너무 가늘어져서 이어진 막대로 보여 줌 */
const SLOT_MAX = 40

/**
 * 사람 수 막대: 정원(max)만큼 칸을 나눠 몇 칸이 찼는지 한눈에 (예: 15명 모집에 7명 확정 → 15칸 중 7칸).
 * 정원보다 많이 확정되면 넘친 만큼 칸을 더해 주황으로 · 40칸이 넘으면 예전처럼 이어진 막대.
 * 처음 보일 때 왼쪽 칸부터 차례로 차오르고, 자동 갱신으로 값이 바뀌면 칸 색이 부드럽게 바뀜
 */
export default function SlotBar({
  value,
  max,
  color = 'bg-brand-500',
  height = 'h-2',
  className = '',
  overflow = true,
}: {
  value: number
  max: number
  color?: string
  height?: string
  className?: string
  /** 정원보다 많이 확정된 칸을 주황으로 더해 보여 줄지 (근무자 화면은 정원까지만) */
  overflow?: boolean
}) {
  const cap = Math.max(0, max)
  const filled = Math.max(0, overflow ? value : Math.min(value, cap))
  const slots = Math.max(cap, filled)
  const label = `${cap}명 중 ${filled}명`
  if (slots === 0 || slots > SLOT_MAX) {
    const pct = Math.min(100, Math.round((filled / Math.max(cap, 1)) * 100))
    return (
      <div className={`${height} overflow-hidden rounded-full bg-bg ${className}`} role="img" aria-label={label}>
        <div className={`h-full origin-left animate-grow rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    )
  }
  return (
    <div className={`flex ${slots > 20 ? 'gap-[2px]' : 'gap-[3px]'} ${height} ${className}`} role="img" aria-label={label} data-slots={slots} data-filled={filled}>
      {Array.from({ length: slots }, (_, i) => {
        const on = i < filled
        const extra = i >= cap
        return (
          <span
            key={i}
            className={`h-full min-w-0 flex-1 rounded-full transition-colors duration-500 ${on ? `origin-left animate-grow ${extra ? 'bg-amber-400' : color}` : 'bg-bg'}`}
            style={on ? { animationDelay: `${0.15 + Math.min(i, 30) * 0.025}s` } : undefined}
          />
        )
      })}
    </div>
  )
}
