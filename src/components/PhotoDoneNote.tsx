'use client'

import { useEffect, useRef, useState } from 'react'
import { PHOTO_DONE_KEY } from '@/lib/photoDone'

/**
 * 공고 화면: 얼굴 사진을 올리자마자 사진 칸이 지원 칸으로 바뀌면 — 바뀐 걸 놓치지 않게
 * 지원 칸 맨 위에 '✓ 사진을 올렸어요 · 이제 지원할 수 있어요'를 띄우고 그 칸을 화면 가운데로.
 * (사진 올리기 칸이 남긴 표시가 2분 안일 때만 · 한 번 보이면 지움)
 */
export default function PhotoDoneNote() {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    try {
      const at = Number(sessionStorage.getItem(PHOTO_DONE_KEY))
      sessionStorage.removeItem(PHOTO_DONE_KEY)
      if (!at || Date.now() - at > 120_000) return
    } catch {
      return
    }
    setShow(true)
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => ref.current?.closest('form')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' }))
  }, [])
  if (!show) return null
  return (
    <p ref={ref} role="status" data-photo-done className="animate-pop rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200/70">
      ✓ 사진을 올렸어요 · 이제 지원할 수 있어요
    </p>
  )
}
