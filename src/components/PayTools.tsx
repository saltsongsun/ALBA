'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Icon from './Icon'

/** 같은 모양의 칸 (아이콘 위 · 글자 아래) — 공고 화면 도구 줄과 같은 모양 */
const BASE = 'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-xs font-semibold ring-1 transition active:scale-95'
const TILE = `${BASE} bg-white text-sub ring-line hover:text-ink`
/** 엑셀을 한 번 눌러 멈춘 동안 (주황으로 '한 번 더 누르기') */
const TILE_ARMED = `${BASE} bg-amber-50 text-amber-800 ring-amber-200`

/**
 * 정산 탭 도구 줄: 급여 설정 · 정산표 엑셀 · 명세서 인쇄 (같은 크기 칸 한 줄).
 * 실수 막기: 아직 안 끝난 근무(근무 중·퇴근 기록 없음)가 있으면 정산표 엑셀은 한 번 멈추고 '정산표에 빠져 있어요' 안내 (4초 안에 한 번 더 누르면 받음)
 */
export default function PayTools({ settingsHref, csvHref, printHref, incomplete }: { settingsHref: string; csvHref: string; printHref: string | null; incomplete: number }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <div className="w-full space-y-2" data-pay-tools>
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        <Link href={settingsHref} className={TILE}>
          <Icon name="gear" className="text-lg text-ink" />
          <span className="max-w-full truncate">급여 설정</span>
        </Link>
        <a
          href={csvHref}
          className={armed ? TILE_ARMED : TILE}
          data-pay-csv
          onClick={(e) => {
            if (!incomplete || armed) return
            e.preventDefault()
            setArmed(true)
            navigator.vibrate?.(30)
          }}
        >
          <Icon name="file" className={`text-lg ${armed ? 'text-amber-600' : 'text-emerald-600'}`} />
          <span className="max-w-full truncate">{armed ? '한 번 더 누르기' : '정산표 엑셀'}</span>
        </a>
        {printHref && (
          <Link href={printHref} className={TILE}>
            <Icon name="printer" className="text-lg text-ink" />
            <span className="max-w-full truncate">명세서 인쇄</span>
          </Link>
        )}
      </div>
      {armed && (
        // 두 줄로 나눠 씀 (한 줄로 이으면 360px에서 말 중간에 꺾임)
        <p className="animate-pop rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status" data-pay-csv-warn>
          <b className="block">아직 안 끝난 근무 {incomplete}건은 정산표에 빠져요</b>
          <span className="block">한 번 더 누르면 그대로 받아요</span>
        </p>
      )}
    </div>
  )
}
