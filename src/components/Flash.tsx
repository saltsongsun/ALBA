'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from './ui'

const SHOW_MS = 6000
/** 지원 접수·근무 확정·서류 서명을 다 마친 것처럼 기쁜 소식이면 화면 가운데에서 색 점이 톡 터지고 체크가 그려짐 (1.2초) */
const PARTY = /지원이 접수됐어요|확정됐어요!|글을 올렸어요|서류 서명을 모두 마쳤어요/
const DOTS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2
  const r = 70 + (i % 3) * 16
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), c: ['#10b981', '#2557e8', '#f59e0b', '#f43f5e'][i % 4] }
})

/**
 * 처리 후 돌아온 화면 위쪽 안내(?m=). 내려왔다가 6초 뒤 부드럽게 접힘.
 * 주소에서 m을 지운 뒤 같은 화면이 다시 그려져도(대화 화면은 열자마자 읽음 숫자를 맞추려 한 번 새로 고침 · 자동 갱신) 떠 있던 안내는 6초를 채움
 * — 예전에는 그때 바로 사라져 대화 화면에서는 안내를 읽을 틈이 없었음. 다른 화면(탭·날짜)으로 옮기면 바로 닫음
 */
export default function Flash({ m }: { m: string | string[] | undefined }) {
  const msg = typeof m === 'string' ? m.slice(0, 200) : ''
  const [shown, setShown] = useState(msg)
  const [closing, setClosing] = useState(false)
  const [party, setParty] = useState(false)

  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const partyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // 안내를 띄운 화면 주소 (m 빼고) — 같은 화면이 다시 그려진 것인지, 다른 화면으로 옮긴 것인지 가름
  const shownAt = useRef('')

  useEffect(() => {
    if (!msg) {
      const here = new URL(location.href)
      here.searchParams.delete('m')
      // 같은 화면이 다시 그려진 것: 떠 있던 안내는 그대로 (닫는 시각도 그대로)
      if (shownAt.current && shownAt.current === here.pathname + here.search) return
      clearTimeout(closeTimer.current)
      clearTimeout(partyTimer.current)
      shownAt.current = ''
      setShown('')
      setClosing(false)
      setParty(false)
      return
    }
    setShown(msg)
    setClosing(false)
    // 새로고침하거나 주소를 공유해도 같은 안내가 다시 뜨지 않게 주소에서 m을 지움
    const url = new URL(location.href)
    url.searchParams.delete('m')
    window.history.replaceState(null, '', url)
    shownAt.current = url.pathname + url.search
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setClosing(true), SHOW_MS)
    clearTimeout(partyTimer.current)
    if (PARTY.test(msg)) {
      setParty(true)
      haptic([12, 60, 18])
      partyTimer.current = setTimeout(() => setParty(false), 1200)
    } else setParty(false)
  }, [msg])

  // 화면을 떠날 때만 시계를 멈춤 (msg가 비어 다시 그려질 때는 그대로 둠)
  useEffect(
    () => () => {
      clearTimeout(closeTimer.current)
      clearTimeout(partyTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => {
      setShown('')
      shownAt.current = ''
    }, 300)
    return () => clearTimeout(t)
  }, [closing])

  if (!shown) return null
  return (
    <>
    {/* 화면 전환 애니메이션(transform) 안에서는 fixed가 화면 기준이 아니게 되므로 body에 바로 붙임 */}
    {party &&
      createPortal(
        <div aria-hidden data-celebrate className="burst pointer-events-none z-50" style={{ position: 'fixed', inset: 0 }}>
        {DOTS.map((d, i) => (
          <i key={i} style={{ '--x': `${d.x}px`, '--y': `${d.y}px`, background: d.c } as React.CSSProperties} />
        ))}
        <span className="grid size-20 animate-pop place-items-center rounded-full bg-white shadow-xl ring-4 ring-emerald-100">
          <svg viewBox="0 0 24 24" className="size-11 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="check-draw" />
          </svg>
        </span>
        </div>,
        document.body,
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
