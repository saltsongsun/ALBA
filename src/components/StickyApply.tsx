'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * 휴대폰에서 공고 화면 아래에 떠 있는 지원 버튼. 지원 칸이 화면 아래쪽에 있어 바로 안 보이므로,
 * 누르면 지원 칸으로 내려가 반짝이고, 지원 칸이 보이는 동안에는 숨습니다.
 * (페이지 전환 애니메이션 영향을 받지 않도록 body에 바로 붙임)
 */
export default function StickyApply({
  targetId,
  title,
  summary,
  href,
  aboveTabs,
  note,
  cta = '지원하기',
  hrefLabel = '1분 가입하고 지원',
}: {
  targetId: string
  title: string
  summary: string
  /** 비로그인: 가입 화면으로 */
  href?: string
  /** 로그인한 근무자는 아래 탭이 있으므로 그 위에 */
  aboveTabs: boolean
  /** 지원 전에 할 일이 있으면 공고 이름 대신 그 안내 (예: 얼굴 사진이 필요해요) */
  note?: string
  /** 버튼 글자 (지원 전에 할 일이 있으면 그 일로 — 눌렀는데 지원이 아니라 놀라지 않게) */
  cta?: string
  /** href가 있을 때 버튼 글자 (확정 뒤 서명이 남았으면 '서명하기') */
  hrefLabel?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [targetVisible, setTargetVisible] = useState(false)

  useEffect(() => {
    setMounted(true)
    const el = document.getElementById(targetId)
    if (!el) return
    const io = new IntersectionObserver(([e]) => setTargetVisible(e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [targetId])

  if (!mounted || targetVisible) return null

  const goToForm = () => {
    const el = document.getElementById(targetId)
    if (!el) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
    if (!still) {
      el.animate([{ boxShadow: '0 0 0 0 rgba(37, 87, 232, 0.45)' }, { boxShadow: '0 0 0 14px rgba(37, 87, 232, 0)' }], { duration: 900, delay: 350, easing: 'ease-out' })
    }
  }

  return createPortal(
    <div
      className={`no-print fixed inset-x-0 z-20 px-3 pb-3 sm:hidden ${aboveTabs ? 'bottom-[var(--tabbar-space)]' : 'bottom-[env(safe-area-inset-bottom)]'}`}
    >
      <div className="glass mx-auto flex max-w-md animate-slide-up items-center gap-3 rounded-[22px] p-2 pl-4">
        <div className="min-w-0 flex-1">
          {note ? (
            <p className="truncate text-xs font-semibold text-amber-700" data-sticky-note>
              {note}
            </p>
          ) : (
            <p className="truncate text-xs text-mute">{title}</p>
          )}
          <p className="font-extrabold tracking-tight">{summary}</p>
        </div>
        {href ? (
          <Link href={href} className="btn-primary shrink-0 px-5" data-track={`공고 아래 바: ${hrefLabel}`}>
            {hrefLabel}
          </Link>
        ) : (
          <button type="button" onClick={goToForm} className={`btn-primary shrink-0 ${cta.length > 5 ? 'px-4' : 'px-6'}`} data-track={`공고 아래 바: ${cta}`}>
            {cta}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
