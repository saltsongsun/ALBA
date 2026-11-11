'use client'

import { useEffect } from 'react'

/**
 * 바로 가기(예: 문의 채팅 '서류 서명하러 가기' → /me#sign-docs)로 왔으면
 * 그 자리의 첫 버튼을 화면 가운데로 옮기고 둘레를 몇 번 번쩍여서 어디를 누를지 바로 보이게
 * (움직임 줄이기면 테두리만 — globals.css [data-flash])
 */
export default function HashFlash({ id }: { id: string }) {
  useEffect(() => {
    if (location.hash !== `#${id}`) return
    let off = 0
    const t = window.setTimeout(() => {
      const box = document.getElementById(id)
      if (!box) return
      const el = box.matches('a, button') ? box : (box.querySelector<HTMLElement>('a, button') ?? box)
      el.scrollIntoView({ block: 'center' })
      el.setAttribute('data-flash', '')
      off = window.setTimeout(() => el.removeAttribute('data-flash'), 3200)
    }, 60)
    return () => {
      clearTimeout(t)
      clearTimeout(off)
    }
  }, [id])
  return null
}
