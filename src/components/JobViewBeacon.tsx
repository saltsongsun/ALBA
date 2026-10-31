'use client'

import { useEffect } from 'react'

/** 공고 화면을 보고 있다는 신호 (처음 + 30초마다, 화면이 보일 때만). 관리자 조회 현황에 쓰임 */
export default function JobViewBeacon({ jobId }: { jobId: string }) {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      fetch(`/api/jobs/${jobId}/view`, { method: 'POST', keepalive: true }).catch(() => {})
    }
    ping()
    const t = setInterval(ping, 30_000)
    document.addEventListener('visibilitychange', ping)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', ping)
    }
  }, [jobId])
  return null
}
