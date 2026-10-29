'use client'

import { useEffect, useState } from 'react'

const SHOW_MS = 6000

/** 처리 후 돌아온 화면 위쪽 안내(?m=). 내려왔다가 6초 뒤 부드럽게 접힘 */
export default function Flash({ m }: { m: string | string[] | undefined }) {
  const msg = typeof m === 'string' ? m.slice(0, 200) : ''
  const [shown, setShown] = useState(msg)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    setShown(msg)
    setClosing(false)
    if (!msg) return
    // 새로고침하거나 주소를 공유해도 같은 안내가 다시 뜨지 않게 주소에서 m을 지움
    const url = new URL(location.href)
    url.searchParams.delete('m')
    window.history.replaceState(null, '', url)
    const t = setTimeout(() => setClosing(true), SHOW_MS)
    return () => clearTimeout(t)
  }, [msg])

  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => setShown(''), 300)
    return () => clearTimeout(t)
  }, [closing])

  if (!shown) return null
  return (
    <div className={`no-print grid transition-all duration-300 ${closing ? 'mb-0 grid-rows-[0fr] opacity-0' : 'mb-4 grid-rows-[1fr]'}`}>
      <div className="overflow-hidden">
        <div role="status" className="relative flex animate-slide-down items-start gap-2 overflow-hidden rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
          <span className="flex-1">{shown}</span>
          <button type="button" aria-label="닫기" onClick={() => setClosing(true)} className="-my-1 -mr-2 rounded-lg px-2 py-1 text-brand-700/50 transition hover:bg-brand-100 active:scale-90">
            ✕
          </button>
          <span aria-hidden className="flash-timer absolute bottom-0 left-0 h-0.5 w-full origin-left bg-brand-500/40" style={{ animationDuration: `${SHOW_MS}ms` }} />
        </div>
      </div>
    </div>
  )
}
