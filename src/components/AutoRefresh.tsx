'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * 화면을 보고 있는 동안 몇 초마다 서버 데이터를 새로 받아 옵니다 (행사 당일 출퇴근 현황 등).
 * 입력칸에 쓰는 중이면 건너뛰고, 다른 앱에 갔다가 돌아오면 바로 새로 받습니다.
 *
 * pulse(가벼운 '바뀐 게 있나요?' 주소, /api/pulse)를 주면: 몇 초마다 그 값만 물어보고,
 * 값이 바뀌었을 때만 화면 전체를 다시 그립니다 (문의·단체방처럼 자주 묻는 화면 — 서버·DB 부담을 크게 줄임)
 */
export default function AutoRefresh({ seconds = 30, quiet = false, pulse }: { seconds?: number; quiet?: boolean; pulse?: string }) {
  const router = useRouter()
  const [at, setAt] = useState<string | null>(null)
  const last = useRef<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    const typing = () => {
      const el = document.activeElement
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    }
    const redraw = () => {
      router.refresh()
      setAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    // 바뀐 게 있으면 true (처음엔 기준값만 잡음)
    const changed = async () => {
      if (!pulse || busy.current) return !pulse
      busy.current = true
      try {
        const r = await fetch(pulse, { cache: 'no-store' })
        if (!r.ok) return false
        const { v } = (await r.json()) as { v: string }
        const prev = last.current
        last.current = v
        return prev !== null && prev !== v
      } catch {
        return false
      } finally {
        busy.current = false
      }
    }
    const tick = async () => {
      if (document.visibilityState !== 'visible' || typing()) return
      if (await changed()) redraw()
    }
    // 돌아왔을 때는 바로 새로 받음 (그동안 바뀐 것)
    const onShow = () => {
      if (document.visibilityState !== 'visible' || typing()) return
      if (pulse) void changed()
      redraw()
    }
    if (pulse) void changed()
    const t = setInterval(tick, seconds * 1000)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [router, seconds, pulse])

  if (quiet) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-mute">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      {seconds}초마다 자동 갱신{at && ` · ${at}`}
    </span>
  )
}
