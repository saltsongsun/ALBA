'use client'

import { useEffect, useRef, useState } from 'react'

/** 머리글 높이 (탭 줄이 붙는 자리) */
const HEADER = 56

/**
 * 탭 줄: 목록을 한참 내려가 있어도 위로 살짝 올리면 머리글 아래에 다시 나타남
 * (탭을 바꾸려고 맨 위까지 올라가지 않게). 아래로 내리는 동안은 숨어서 화면을 차지하지 않고,
 * 제자리(화면 안)에 있을 땐 그냥 그 자리.
 * data-reveal: rest(제자리) · shown(붙어서 보임) · hidden(숨음)
 */
export default function RevealTabs({ id, className = '', children, ...rest }: { id?: string; className?: string; children: React.ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  const bar = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'rest' | 'shown' | 'hidden'>('rest')

  useEffect(() => {
    let last = window.scrollY
    let raf = 0
    const run = () => {
      raf = 0
      const el = bar.current
      if (!el) return
      const y = window.scrollY
      const d = y - last
      // 제자리가 머리글 아래로 지나갔는지: 바로 앞 칸의 아래 끝(+간격)으로 봄 (탭 줄 자신은 붙어 있어 위치가 안 바뀜)
      const prev = el.previousElementSibling
      const past = prev ? prev.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(prev).marginBottom) || 0) < HEADER - 1 : false
      if (!past) {
        setMode('rest')
        last = y
        return
      }
      if (d > 6) setMode('hidden')
      else if (d < -6) setMode('shown')
      else {
        // 거의 안 움직였으면 그대로 (처음 지나간 순간엔 숨김)
        setMode((m) => (m === 'rest' ? 'hidden' : m))
        return
      }
      last = y
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(run)
    }
    window.addEventListener('scroll', on, { passive: true })
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={bar}
      id={id}
      data-reveal={mode}
      inert={mode === 'hidden'}
      className={`${className} sticky top-14 z-10 transition-[translate,opacity] duration-200 ${
        mode === 'rest' ? '' : 'rounded-b-xl bg-white/95 px-1 shadow-[0_6px_16px_-10px_rgba(0,0,0,0.25)] backdrop-blur-xl'
      } ${mode === 'hidden' ? 'pointer-events-none -translate-y-3 opacity-0' : ''}`}
      {...rest}
    >
      {children}
    </div>
  )
}
