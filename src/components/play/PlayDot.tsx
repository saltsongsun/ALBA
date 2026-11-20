'use client'

import { useEffect, useState } from 'react'

/**
 * 커뮤니티 '🎮 놀이터' 줄의 작은 점: 오늘의 운세를 아직 안 열었으면 깜빡이는 점 (열면 사라짐 · 이 휴대폰 기준).
 * 정기 개선 2026-11-21 03:35 · 움직임 줄이기면 깜빡임 없이 점만
 */
export default function PlayDot() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      // 놀이터 운세 카드가 연 날짜를 적어 두는 칸과 같은 형식 (한국 날짜 YYYY-MM-DD)
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
      setShow(localStorage.getItem('play-fortune-open') !== today)
    } catch {}
  }, [])
  if (!show) return null
  return (
    <span className="relative inline-flex size-2 shrink-0" data-play-dot role="img" aria-label="오늘의 운세를 아직 안 봤어요">
      <span aria-hidden className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75 motion-reduce:hidden" />
      <span aria-hidden className="relative inline-flex size-2 rounded-full bg-rose-500" />
    </span>
  )
}
