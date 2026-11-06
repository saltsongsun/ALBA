'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const LATER = 'clockout-prompt-later'

/**
 * 예정 종료 시각이 지났는데 아직 '근무 중'이면, 어느 화면에서든 아래쪽에 '근무 종료를 눌러 주세요' (누르면 내 근무의 근무 종료 버튼으로).
 * 사용자 요청 2026-11-06 "근무종료 안누르고 가는 사람들이 있어서 근무종료 누르게 해줘".
 * 내 근무 화면에는 근무 종료 버튼과 안내가 이미 있어 숨김 · '나중에'를 누르면 이 창(탭)에서 20분 동안 숨김
 */
export default function ClockOutPrompt({ endText, title }: { endText: string; title: string }) {
  const path = usePathname()
  // 처음엔 숨겨 두고 (저장값을 읽은 뒤 보여서 깜빡이지 않게)
  const [later, setLater] = useState(true)
  useEffect(() => {
    try {
      setLater(Date.now() - Number(sessionStorage.getItem(LATER) ?? 0) < 20 * 60_000)
    } catch {
      setLater(false)
    }
  }, [])
  if (later || path === '/me') return null
  const hide = () => {
    try {
      sessionStorage.setItem(LATER, String(Date.now()))
    } catch {}
    setLater(true)
  }
  return (
    <div data-vv="pin" role="status" data-clockout-prompt className="no-print fixed inset-x-0 bottom-[calc(var(--tabbar-space)+8px)] z-30 px-3 sm:bottom-4">
      <div className="glass animate-slide-up mx-auto max-w-md space-y-2 rounded-[22px] p-3 pl-4 ring-1 ring-rose-200">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-rose-700">⏰ 종료 시각({endText})이 지났어요</p>
          <p className="truncate text-[13px] text-sub">{title} · 일이 끝났으면 근무 종료를 눌러 주세요</p>
        </div>
        <div className="flex gap-2">
          <Link href="/me#clock" data-track="근무 종료하러 가기" className="btn-sm btn flex-1 bg-rose-500 text-white hover:bg-rose-600">
            근무 종료하러 가기
          </Link>
          <button type="button" onClick={hide} className="btn-gray btn-sm shrink-0">
            나중에
          </button>
        </div>
      </div>
    </div>
  )
}
