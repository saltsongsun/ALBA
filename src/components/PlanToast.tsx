'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'

const SHOW_MS = 5000

/**
 * 지원자 탭에서 한 사람씩 확정·되돌리면 머리글 아래 잠깐 떠 있는 안내 (관리자 화면에만 씀 · 사용자 요청 2026-11-24
 * "지원자를 확정하면 확정한 전체 일정 얼마인지 알려줘")
 * '확정 4명 · 전체 약 825,600원 · +247,680원'
 * — 확정한 사람 카드는 접힌 '확정 n명' 칸으로 들어가 금액이 바로 안 보이고, 화면을 옮기면(안내 주소) 맨 위로 튀어서
 *   화면은 그대로 두고 합계가 바뀐 것만 보고 알려 줌. 처음 열 때·다른 화면에서 돌아올 때는 안 뜸
 * — '모두 확정'·'선택 확정'처럼 위쪽 안내(?m=)를 달고 온 화면에서는 그 안내에 금액이 있으므로 겹쳐 띄우지 않음
 */
export default function PlanToast({ total, count }: { total: number; count: number }) {
  const prev = useRef<{ total: number; count: number } | null>(null)
  // 이번 화면이 위쪽 안내를 달고 왔는지 (그린 때 값 · 안내가 주소에서 m을 지우기 전)
  const withNote = useSearchParams().has('m')
  const [shown, setShown] = useState<{ total: number; count: number; diff: number; at: number } | null>(null)
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const p = prev.current
    prev.current = { total, count }
    if (!p || (p.total === total && p.count === count) || withNote) return
    setShown({ total, count, diff: total - p.total, at: Date.now() })
    setClosing(false)
    const close = setTimeout(() => setClosing(true), SHOW_MS)
    const gone = setTimeout(() => setShown(null), SHOW_MS + 300)
    return () => {
      clearTimeout(close)
      clearTimeout(gone)
    }
    // withNote는 일부러 뺌: 안내가 주소에서 m을 지울 때 다시 돌면 안 됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, count])

  if (!mounted || !shown) return null
  const won = (n: number) => `${Math.abs(n).toLocaleString('ko-KR')}원`
  return createPortal(
    <div
      className={`no-print fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+4.25rem)] z-50 mx-auto w-full max-w-md px-4 transition-opacity duration-300 ${closing ? 'opacity-0' : ''}`}
      data-plan-toast
    >
      <div className="rounded-xl bg-white shadow-lg shadow-brand-900/10">
        <div key={shown.at} role="status" className="relative flex animate-slide-down items-center gap-2 overflow-hidden rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="min-w-0 flex-1 truncate">
            확정 <b className="tabular-nums">{shown.count}명</b> · 전체 약 <b className="tabular-nums">{won(shown.total)}</b>
          </span>
          {shown.diff !== 0 && (
            <b className={`shrink-0 animate-pop tabular-nums ${shown.diff > 0 ? 'text-emerald-700' : 'text-sub'}`} data-plan-toast-diff>
              {shown.diff > 0 ? '+' : '−'}
              {won(shown.diff)}
            </b>
          )}
          <button type="button" aria-label="닫기" onClick={() => setClosing(true)} className="-my-1 -mr-2 shrink-0 rounded-lg px-2 py-1 text-emerald-900/40 transition hover:bg-emerald-100 active:scale-90">
            ✕
          </button>
          <span aria-hidden className="flash-timer absolute bottom-0 left-0 h-0.5 w-full origin-left bg-emerald-500/40" style={{ animationDuration: `${SHOW_MS}ms` }} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
