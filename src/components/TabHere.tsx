'use client'

import { useEffect, useState } from 'react'

/**
 * 아래 탭: 지금 보고 있는 탭을 또 눌렀을 때 (근무자·관리자 탭 같이 씀)
 * - 아래로 내려가 있으면 맨 위로
 * - 이미 맨 위면 "지금 'OO' 화면이에요" 말풍선을 잠깐 (아무 반응이 없어 여러 번 누르던 것 · 사용자 요청 2026-11-16)
 */
export function useTabHere(path: string) {
  const [here, setHere] = useState<{ label: string; n: number } | null>(null)
  useEffect(() => {
    if (!here) return
    const t = setTimeout(() => setHere(null), 1800)
    return () => clearTimeout(t)
  }, [here])
  useEffect(() => setHere(null), [path])
  const tapSame = (label: string) => {
    if (window.scrollY < 8) {
      setHere((h) => ({ label, n: (h?.n ?? 0) + 1 }))
      return
    }
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
  }
  return [here, tapSame] as const
}

/** 아래 탭 위에 잠깐 뜨는 '지금 이 화면' 말풍선 (탭 막대 안 · 가운데) */
export function TabHereBubble({ here }: { here: { label: string; n: number } | null }) {
  if (!here) return null
  return (
    <span
      key={here.n}
      role="status"
      data-tab-here
      className="absolute -top-10 left-1/2 -translate-x-1/2 animate-rise rounded-full bg-ink px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white shadow-lg [animation-duration:.2s]"
    >
      지금 &lsquo;{here.label}&rsquo; 화면이에요
    </span>
  )
}

/** 지금 있는 탭 표시 (진한 바탕 · 누르는 순간 미끄러지듯 옮겨 감) */
export const TAB_INDICATOR =
  'absolute inset-y-1.5 left-1.5 rounded-[20px] bg-brand-600 shadow-[0_6px_16px_-6px_var(--color-brand-600)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.3,1.35,0.4,1)] motion-reduce:transition-none'
