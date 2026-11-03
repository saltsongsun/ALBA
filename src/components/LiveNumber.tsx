'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const COUNT_MS = 650

/**
 * 숫자가 바뀌면(자동 갱신 등) 통 튀어서 바뀐 걸 알려 줌.
 * countUp: 화면을 처음 열 때 0에서 그 숫자까지 빠르게 올라감 (대시보드 숫자). '움직임 줄이기' 설정이면 바로 보여 줌
 */
export default function LiveNumber({ value, className = '', countUp = false }: { value: number; className?: string; countUp?: boolean }) {
  const prev = useRef(value)
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)

  // 처음 그릴 때 화면에 숫자가 보이기 전에 0으로 바꿔 두고 올라가게 (서버 화면은 실제 숫자라 깜빡임 없음)
  useLayoutEffect(() => {
    if (!countUp || value < 2) return
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    } catch {}
    setShown(0)
    const start = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / COUNT_MS)
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // 처음 한 번만 (그 뒤 바뀌는 숫자는 아래 '통 튀기'로)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    setShown(value)
    const el = ref.current
    if (!el) return
    el.classList.remove('animate-bump')
    void el.offsetWidth // 애니메이션 다시 시작
    el.classList.add('animate-bump')
  }, [value])
  return (
    <span ref={ref} className={`inline-block tabular-nums ${className}`} data-value={value}>
      {shown.toLocaleString('ko-KR')}
    </span>
  )
}
