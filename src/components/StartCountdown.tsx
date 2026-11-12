'use client'

import { useEffect, useState } from 'react'
import { minutesText } from '@/lib/time'

/**
 * 근무자 홈 '오늘 근무' 카드: 시작까지 남은 시간 한 줄 ('2시간 24분 뒤 시작' · 시간이 되면 '지금 시작할 시간이에요')
 * 30초마다 줄어듦 · serverNow로 처음 그려서 서버·브라우저 화면이 같게 (관리자 공고 화면의 StartsIn과 같은 방식)
 */
export default function StartCountdown({ at, serverNow }: { at: string; serverNow: number }) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const left = Math.ceil((Date.parse(at) - now) / 60_000)
  return <span data-start-countdown={Math.max(0, left)}>{left > 0 ? `${minutesText(left)} 뒤 시작` : '지금 시작할 시간이에요'}</span>
}
