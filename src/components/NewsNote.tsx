'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * 관리자 대시보드의 한 줄 새 소식 (바뀐 규칙을 회사마다 알리기) — 누르면 자세히, ×를 누르면 이 휴대폰에서 다시 안 보임.
 * 처음 그릴 땐 숨겨 두고(서버 화면엔 없음) 닫은 적이 없을 때만 살짝 내려오며 보임 · 움직임 줄이기 설정이면 바로
 */
export default function NewsNote({ id, href, children }: { id: string; href: string; children: React.ReactNode }) {
  const key = `news-${id}`
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      setShow(localStorage.getItem(key) !== '1')
    } catch {
      setShow(true)
    }
  }, [key])
  if (!show) return null
  const close = () => {
    try {
      localStorage.setItem(key, '1')
    } catch {}
    setShow(false)
  }
  return (
    <div className="flex animate-slide-down items-center gap-1 rounded-2xl bg-white py-1 pr-1 pl-3.5 ring-1 ring-line" data-news={id}>
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand-500" />
      <Link href={href} className="min-w-0 flex-1 truncate py-2 pl-1.5 text-[13px] font-semibold text-ink">
        {children}
      </Link>
      <button type="button" onClick={close} aria-label="이 소식 닫기" className="grid size-9 shrink-0 place-items-center rounded-xl text-mute active:bg-bg" data-news-close>
        ×
      </button>
    </div>
  )
}
