'use client'

import { useEffect, useState } from 'react'

/**
 * 근무자가 보는 서류 보호: 글자 복사·길게 눌러 저장·끌어서 저장을 막고,
 * 다른 앱으로 넘어가거나 창이 가려지면(캡처 도구 등) 내용을 흐리게. 화면 캡처 자체를 완전히 막을 수는 없어서
 * 서류 뒤에 열람 일시·열람자 워터마크를 함께 찍음(DocSheet watermark)
 */
export default function DocGuard({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const hide = () => setHidden(true)
    const show = () => setHidden(document.visibilityState !== 'visible')
    const vis = () => setHidden(document.visibilityState !== 'visible')
    window.addEventListener('blur', hide)
    window.addEventListener('focus', show)
    document.addEventListener('visibilitychange', vis)
    // 키보드 캡처·인쇄 단축키 (PrintScreen, Ctrl/Cmd+P·S) 막기
    const key = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || ((e.ctrlKey || e.metaKey) && ['p', 's'].includes(e.key.toLowerCase()))) {
        e.preventDefault()
        setHidden(true)
        navigator.clipboard?.writeText('').catch(() => {})
        setTimeout(() => setHidden(document.visibilityState !== 'visible'), 1500)
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('blur', hide)
      window.removeEventListener('focus', show)
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('keydown', key)
    }
  }, [])
  const stop = (e: React.SyntheticEvent) => e.preventDefault()
  return (
    <div
      className="doc-guard relative select-none"
      onContextMenu={stop}
      onCopy={stop}
      onCut={stop}
      onDragStart={stop}
    >
      <div className={`transition duration-150 ${hidden ? 'blur-lg' : ''}`}>{children}</div>
      {hidden && (
        <p className="absolute inset-x-0 top-24 mx-auto w-fit rounded-xl bg-ink/80 px-4 py-2 text-sm font-semibold text-white">
          보호된 서류예요 · 앱 화면에서만 볼 수 있어요
        </p>
      )}
    </div>
  )
}
