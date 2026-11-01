'use client'

import { useEffect } from 'react'

/**
 * 주소의 #이름으로 이동했을 때 그 칸 안의 접힌 카드(details)를 펼침.
 * 예: 내 정보 '정보 채우기'에서 '행사 경력 채우기'를 누르면 경력 칸이 펼쳐진 채로 보이게
 */
export default function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1))
      if (!id) return
      const el = document.getElementById(id)
      const d = el?.tagName === 'DETAILS' ? (el as HTMLDetailsElement) : el?.querySelector('details')
      if (d && !d.open) d.open = true
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
  return null
}
