'use client'

import { useEffect, useState } from 'react'

const KEY = 'theme'

/** 어두운 화면 (베타 · 이 휴대폰에만 저장). 밤 현장·눈부심 줄이기. 서류·명세서는 늘 밝게 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    if (next) document.documentElement.dataset.theme = 'dark'
    else delete document.documentElement.dataset.theme
    try {
      if (next) localStorage.setItem(KEY, 'dark')
      else localStorage.removeItem(KEY)
    } catch {}
  }
  return (
    // 줄 전체 누름 반응 + 손잡이가 0.2초 스프링으로 미끄러짐 (움직임 줄이기면 바로 · 정기 개선 2026-11-23 14:35)
    <button type="button" role="switch" aria-checked={dark} onClick={toggle} className="flex w-full items-center gap-3 text-left transition-transform active:scale-[0.99]" data-theme-toggle>
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-bg text-lg">
        {dark ? '🌙' : '☀️'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">
          어두운 화면 <span className="badge bg-brand-50 align-middle text-brand-700">베타</span>
        </span>
        <span className="block text-sm text-sub">밤에 눈이 덜 부셔요 <span className="whitespace-nowrap">(이 휴대폰에만)</span></span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${dark ? 'bg-brand-600' : 'bg-line'}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-[#fff] shadow transition-[left] duration-200 ease-[var(--ease-spring)] ${dark ? 'left-[22px]' : 'left-0.5'}`} data-switch-knob />
      </span>
    </button>
  )
}
