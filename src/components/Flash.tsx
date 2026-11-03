'use client'

import { useEffect, useState } from 'react'
import { haptic } from './ui'

const SHOW_MS = 6000
/** 지원 접수·근무 확정처럼 기쁜 소식이면 화면 가운데에서 색 점이 톡 터지고 체크가 그려짐 (1.2초) */
const PARTY = /지원이 접수됐어요|확정됐어요!/
const DOTS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2
  const r = 70 + (i % 3) * 16
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), c: ['#10b981', '#2557e8', '#f59e0b', '#f43f5e'][i % 4] }
})

/** 처리 후 돌아온 화면 위쪽 안내(?m=). 내려왔다가 6초 뒤 부드럽게 접힘 */
export default function Flash({ m }: { m: string | string[] | undefined }) {
  const msg = typeof m === 'string' ? m.slice(0, 200) : ''
  const [shown, setShown] = useState(msg)
  const [closing, setClosing] = useState(false)
  const [party, setParty] = useState(false)

  useEffect(() => {
    setShown(msg)
    setClosing(false)
    if (!msg) return
    // 새로고침하거나 주소를 공유해도 같은 안내가 다시 뜨지 않게 주소에서 m을 지움
    const url = new URL(location.href)
    url.searchParams.delete('m')
    window.history.replaceState(null, '', url)
    const t = setTimeout(() => setClosing(true), SHOW_MS)
    let p: ReturnType<typeof setTimeout> | undefined
    if (PARTY.test(msg)) {
      setParty(true)
      haptic([12, 60, 18])
      p = setTimeout(() => setParty(false), 1200)
    }
    return () => {
      clearTimeout(t)
      if (p) clearTimeout(p)
    }
  }, [msg])

  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => setShown(''), 300)
    return () => clearTimeout(t)
  }, [closing])

  if (!shown) return null
  return (
    <>
    {party && (
      <div aria-hidden data-celebrate className="burst pointer-events-none fixed inset-0 z-50">
        {DOTS.map((d, i) => (
          <i key={i} style={{ '--x': `${d.x}px`, '--y': `${d.y}px`, background: d.c } as React.CSSProperties} />
        ))}
        <span className="grid size-20 animate-pop place-items-center rounded-full bg-white shadow-xl ring-4 ring-emerald-100">
          <svg viewBox="0 0 24 24" className="size-11 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="check-draw" />
          </svg>
        </span>
      </div>
    )}
    <div className={`no-print grid transition-all duration-300 ${closing ? 'mb-0 grid-rows-[0fr] opacity-0' : 'mb-4 grid-rows-[1fr]'}`}>
      <div className="overflow-hidden">
        <div role="status" className="relative flex animate-slide-down items-start gap-2 overflow-hidden rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
          <span className="flex-1">{shown}</span>
          <button type="button" aria-label="닫기" onClick={() => setClosing(true)} className="-my-1 -mr-2 rounded-lg px-2 py-1 text-brand-700/50 transition hover:bg-brand-100 active:scale-90">
            ✕
          </button>
          <span aria-hidden className="flash-timer absolute bottom-0 left-0 h-0.5 w-full origin-left bg-brand-500/40" style={{ animationDuration: `${SHOW_MS}ms` }} />
        </div>
      </div>
    </div>
    </>
  )
}
