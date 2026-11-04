'use client'

import { useEffect, useState } from 'react'
import { haptic } from './ui'

/** 긴 화면을 한참 내려가면 오른쪽 아래에 '맨 위로' 버튼 (아래 탭 위) */
export default function ScrollTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const on = () => setShow(window.scrollY > 900)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  if (!show) return null
  return (
    <button
      type="button"
      aria-label="맨 위로"
      data-scroll-top
      onClick={() => {
        haptic(8)
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
      }}
      className="no-print fixed right-4 bottom-[calc(var(--tabbar-space)+12px)] z-30 grid size-11 animate-pop place-items-center glass rounded-full text-sub transition active:scale-90 sm:bottom-6"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  )
}
