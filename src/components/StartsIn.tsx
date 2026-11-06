'use client'

import { useEffect, useState } from 'react'
import { minutesText } from '@/lib/time'

/**
 * 관리자 공고 화면 '시작 전' 줄: 시작까지 남은 시간 (30초마다 줄어듦 · 근무자 화면의 시작까지와 같은 방식)
 * serverNow로 처음 그려서 서버·브라우저 화면이 같게
 */
export default function StartsIn({ startAt, serverNow }: { startAt: string; serverNow: number }) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const left = Math.ceil((Date.parse(startAt) - now) / 60_000)
  return (
    <span className="mt-0.5 block text-xs font-medium text-mute tabular-nums" data-starts-in>
      {left > 0 ? `시작까지 ${minutesText(left)}` : '곧 시작해요 · 도착한 사람부터 출석 체크해 주세요'}
    </span>
  )
}
