'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * 화면을 보고 있는 동안 몇 초마다 서버 데이터를 새로 받아 옵니다 (행사 당일 출퇴근 현황 등).
 * 입력칸에 쓰는 중이면 건너뛰고, 다른 앱에 갔다가 돌아오면 바로 새로 받습니다.
 */
export default function AutoRefresh({ seconds = 30, quiet = false }: { seconds?: number; quiet?: boolean }) {
  const router = useRouter()
  const [at, setAt] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return
      router.refresh()
      setAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    const t = setInterval(refresh, seconds * 1000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [router, seconds])

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
