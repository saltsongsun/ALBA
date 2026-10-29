'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

// 링크를 누른 순간부터 다음 화면이 그려질 때까지 맨 위에 진행 막대를 보여 줍니다.
// 모든 화면이 서버에서 그려지므로, 응답을 기다리는 동안 앱이 멈춘 것처럼 보이지 않게 하려는 것.
// 화면이 바뀌면 막대가 끝까지 찼다가 사라집니다.
export default function NavProgress() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle')

  useEffect(() => setPhase((p) => (p === 'loading' ? 'done' : p)), [pathname, search])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // <Link>가 기본 동작을 막고 앱 안에서 이동할 때만 (CSV 내려받기·전화·새 창 링크는 제외)
      if (!e.defaultPrevented) return
      const a = (e.target as Element | null)?.closest('a')
      if (!a?.href) return
      const url = new URL(a.href)
      if (url.origin !== location.origin) return
      if (url.pathname === location.pathname && url.search === location.search) return
      setPhase('loading')
    }
    // window에 달아야 <Link>의 클릭 처리(preventDefault)가 끝난 뒤에 실행됨
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    if (phase === 'idle') return
    // 끝난 막대는 사라지는 애니메이션 뒤에 치우고, 이동이 실패해 끝 신호를 놓쳐도 계속 남지 않게
    const t = setTimeout(() => setPhase('idle'), phase === 'done' ? 400 : 15_000)
    return () => clearTimeout(t)
  }, [phase])

  return phase === 'idle' ? null : <div className={`nav-progress${phase === 'done' ? ' done' : ''}`} aria-hidden />
}
