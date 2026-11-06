'use client'

import Icon from '@/components/Icon'
import { useEffect, useState } from 'react'
import LiveNumber from './LiveNumber'

type Stats = { total: number; members: number; live: number }

/** 관리자만: 공고를 확인한 인원(가입자 · 비회원)과 지금 보고 있는 인원 (15초마다 새로) */
export default function JobViewStats({ jobId, initial }: { jobId: string; initial: Stats }) {
  const [s, setS] = useState(initial)
  useEffect(() => {
    const load = () =>
      document.visibilityState === 'visible' &&
      fetch(`/api/jobs/${jobId}/viewers`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Stats | null) => d && setS(d))
        .catch(() => {})
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [jobId])
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span>
        <Icon name="eye" className="text-mute" /> 확인 <b className="tabular-nums">{<LiveNumber value={s.total} />}</b>명
        {/* 확인 = 가입자 + 로그인 안 하고 본 사람(비회원) — 두 수를 나눠 보여 줘 '확인'이 가입자 수로 오해되지 않게 */}
        {/* 아직 아무도 안 봤으면 '(가입자 0명)'은 빼서 짧게 */}
        {s.total > 0 && (
          <span className="text-mute" data-view-split>
            {' '}
            (가입자 {s.members}명{s.total > s.members && ` · 비회원 ${s.total - s.members}명`})
          </span>
        )}
      </span>
      <span className={`inline-flex items-center gap-1.5 font-semibold ${s.live ? 'text-emerald-600' : 'text-mute'}`}>
        <span className="relative flex size-2">
          {s.live > 0 && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
          <span className={`relative inline-flex size-2 rounded-full ${s.live ? 'bg-emerald-500' : 'bg-gray-300'}`} />
        </span>
        {/* 글자·숫자·'명'을 한 덩어리로 (flex 간격이 '0 명'처럼 벌어지지 않게) */}
        <span data-view-live>
          지금 보는 중 <LiveNumber value={s.live} />명
        </span>
      </span>
    </p>
  )
}
