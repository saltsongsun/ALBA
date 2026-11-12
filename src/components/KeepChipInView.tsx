'use client'

import { useEffect, useRef } from 'react'

/**
 * 옆으로 넘기는 칩 줄에서 고른 칩([data-chip-on])이 화면 밖에 숨어 있으면 가운데로 데려옴
 * (여러 날 행사의 뒷날을 열었을 때 고른 날짜가 오른쪽 끝 너머에 숨지 않게).
 * 칩 줄(부모) 안에만 넣고, 페이지 세로 위치는 건드리지 않음 · '움직임 줄이기'면 바로 이동
 */
export default function KeepChipInView({ on }: { on: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const row = ref.current?.parentElement
    const chip = row?.querySelector<HTMLElement>('[data-chip-on]')
    if (!row || !chip) return
    const r = row.getBoundingClientRect()
    const c = chip.getBoundingClientRect()
    if (c.left >= r.left && c.right <= r.right) return // 이미 다 보임
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    row.scrollTo({ left: row.scrollLeft + (c.left + c.width / 2) - (r.left + r.width / 2), behavior: reduce ? 'auto' : 'smooth' })
  }, [on])
  return <span ref={ref} hidden />
}
