'use client'

import { useEffect, useState } from 'react'

/**
 * 오늘 근무 카드 맨 아래 얇은 진행 막대: 근무 시간이 얼마나 지났는지 (시작 → 예정 종료).
 * 처음 그릴 땐 0에서 지금까지 짧게(0.3초) 차오르고, 1분마다 다시 계산 · '움직임 줄이기'면 바로
 */
export default function ShiftBar({ from, to }: { from: string; to: string }) {
  const [pct, setPct] = useState<number | null>(null)
  useEffect(() => {
    const a = Date.parse(from)
    const b = Date.parse(to)
    const calc = () => (b > a ? Math.max(0, Math.min(100, ((Date.now() - a) / (b - a)) * 100)) : 100)
    // 처음 한 번은 다음 그림에서 (0 → 지금으로 차오르는 게 보이게)
    const raf = requestAnimationFrame(() => setPct(calc()))
    const t = setInterval(() => setPct(calc()), 60_000)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(t)
    }
  }, [from, to])
  const shown = Math.round(pct ?? 0)
  return (
    <span
      role="progressbar"
      aria-label="오늘 근무 시간 지난 정도"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      className="absolute inset-x-0 bottom-0 h-1 bg-white/20"
      data-shift-bar={pct == null ? '' : shown}
    >
      <span className="block h-full rounded-r-full bg-white/85 transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${pct ?? 0}%` }} />
    </span>
  )
}
