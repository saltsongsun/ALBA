'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { haptic } from './ui'

/** 이만큼(px) 당기면 놓았을 때 새로 고침 */
const READY_AT = 70
const MAX = 96

/** 홈 화면에 설치한 앱으로 열었는지 (브라우저에는 당겨서 새로 고침이 이미 있어서 앱에서만 켬) */
function installed() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/**
 * 설치한 앱에서 화면 맨 위에서 아래로 당기면 새로 고침 (설치한 앱에는 브라우저 새로 고침 버튼이 없음).
 * 병아리 얼굴이 당긴 만큼 내려오며 돌고, 충분히 당기면 살짝 진동, 놓으면 빙글빙글 돌며 새 내용을 불러옴.
 * 입력칸·이모티콘 창·옆으로 넘기는 줄에서 시작한 손짓은 무시. 화면 스크롤은 막지 않음.
 */
export default function PullToRefresh() {
  const router = useRouter()
  const [on, setOn] = useState(false)
  const [pull, setPull] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'pulling' | 'ready' | 'refreshing'>('idle')
  const [pending, start] = useTransition()
  const startY = useRef<number | null>(null)
  const startX = useRef(0)
  const ready = useRef(false)
  const since = useRef(0)

  useEffect(() => setOn(installed()), [])

  useEffect(() => {
    if (!on) return
    const reset = () => {
      startY.current = null
      ready.current = false
      setPull(0)
    }
    const down = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.scrollY > 0) return
      const t = e.target as Element | null
      if (t?.closest('input, textarea, select, [role=dialog], [data-no-ptr], .overflow-x-auto')) return
      startY.current = e.touches[0].clientY
      startX.current = e.touches[0].clientX
    }
    const move = (e: TouchEvent) => {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      const dx = Math.abs(e.touches[0].clientX - startX.current)
      // 위로 밀거나, 옆으로 더 많이 밀거나, 중간에 스크롤이 내려갔으면 취소
      if (dy <= 0 || dx > dy || window.scrollY > 0) {
        setPhase('idle')
        reset()
        return
      }
      const p = Math.min(MAX, dy * 0.55)
      setPull(p)
      const isReady = p >= READY_AT
      if (isReady && !ready.current) haptic(10)
      ready.current = isReady
      setPhase(isReady ? 'ready' : 'pulling')
    }
    const up = () => {
      if (startY.current === null) return
      if (ready.current) {
        setPhase('refreshing')
        since.current = Date.now()
        start(() => router.refresh())
      } else setPhase('idle')
      reset()
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', up, { passive: true })
    window.addEventListener('touchcancel', up, { passive: true })
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
      window.removeEventListener('touchcancel', up)
    }
  }, [on, router])

  // 새 내용이 다 오면 (너무 빨리 끝나도 0.5초는 돌고) 사라짐
  useEffect(() => {
    if (phase !== 'refreshing' || pending) return
    const t = setTimeout(() => setPhase('idle'), Math.max(0, 500 - (Date.now() - since.current)))
    return () => clearTimeout(t)
  }, [phase, pending])

  if (!on || phase === 'idle') return null
  const refreshing = phase === 'refreshing'
  const y = refreshing ? 64 : pull
  return (
    <div
      aria-live="polite"
      data-ptr={phase}
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-40 flex justify-center"
      // 손가락을 따라올 때는 바로, 놓은 뒤에는 부드럽게
      style={{ transform: `translateY(${y - 44}px)`, transition: refreshing ? 'transform 200ms ease-out' : undefined }}
    >
      <span
        className={`grid size-11 place-items-center rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.15)] ring-1 ring-line ${phase === 'ready' ? 'ring-2 ring-brand-400' : ''}`}
        style={{ opacity: Math.min(1, y / READY_AT) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 작은 고정 그림 */}
        <img
          src="/stickers/icon.webp"
          alt=""
          width={30}
          height={30}
          className={`rounded-full motion-reduce:animate-none ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? { animationDuration: '0.8s' } : { transform: `rotate(${pull * 4}deg)` }}
        />
      </span>
      <span className="sr-only">{refreshing ? '새로 고치는 중' : phase === 'ready' ? '놓으면 새로 고침' : '당겨서 새로 고침'}</span>
    </div>
  )
}
