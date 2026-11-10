'use client'

import { useEffect } from 'react'

/**
 * 주소의 #이름 칸으로 내려가 테두리로 표시 (data-hash-focus).
 * 앱 안에서 화면을 옮기면 브라우저가 #이름으로 내려 주지 않고 :target도 걸리지 않아 직접 함.
 * prefix: 이 화면에서 다루는 이름 머리말 (예: 'app-' → 지원자 카드). 안 보이는 칸(넓은 화면에서 숨긴 휴대폰용 카드)은 건너뜀
 */
export default function HashFocus({ prefix }: { prefix: string }) {
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(location.hash.slice(1))
      if (!id.startsWith(prefix)) return
      document.querySelectorAll('[data-hash-focus]').forEach((e) => e.removeAttribute('data-hash-focus'))
      const el = document.getElementById(id)
      if (!el || el.offsetParent === null) return
      el.setAttribute('data-hash-focus', '')
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
    // 화면 전환·다른 스크롤 맞춤이 끝난 뒤에 (바로 하면 다시 위로 올라감)
    const t = setTimeout(go, 150)
    window.addEventListener('hashchange', go)
    return () => {
      clearTimeout(t)
      window.removeEventListener('hashchange', go)
    }
  }, [prefix])
  return null
}
