'use client'

import { useEffect, useRef } from 'react'

/** 숫자가 바뀌면(자동 갱신 등) 통 튀어서 바뀐 걸 알려 줌 */
export default function LiveNumber({ value, className = '' }: { value: number; className?: string }) {
  const prev = useRef(value)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    const el = ref.current
    if (!el) return
    el.classList.remove('animate-bump')
    void el.offsetWidth // 애니메이션 다시 시작
    el.classList.add('animate-bump')
  }, [value])
  return (
    <span ref={ref} className={`inline-block tabular-nums ${className}`}>
      {value.toLocaleString('ko-KR')}
    </span>
  )
}
