'use client'

import { useEffect, useState } from 'react'

/** 이 휴대폰에서 공고 목록을 마지막으로 본 때 (브라우저에만 저장, 서버에는 안 보냄) */
const KEY = 'hw-jobs-seen-at'

// 이번에 앱을 열기 전의 '마지막으로 본 때' (앱 안에서 화면을 오가도 같은 기준이 유지되게 한 번만 읽음)
let before: number | null | undefined

function seenBefore(): number | null {
  if (before === undefined) {
    try {
      const v = Number(localStorage.getItem(KEY))
      before = v > 0 ? v : null
    } catch {
      before = null
    }
  }
  return before
}

const isNew = (createdAt: string, since: number | null) => since !== null && Date.parse(createdAt) > since

/** 공고 카드: 지난번에 본 뒤로 새로 올라온 공고 */
export function NewBadge({ createdAt }: { createdAt: string }) {
  const [on, setOn] = useState(false)
  useEffect(() => setOn(isNew(createdAt, seenBefore())), [createdAt])
  if (!on) return null
  return (
    <span className="badge animate-pop bg-rose-50 text-rose-600 ring-1 ring-rose-100" data-new-job>
      🆕 새 공고
    </span>
  )
}

/**
 * 공고 목록 위: '지난번 이후 새 공고 N개' (처음 온 사람에게는 안 보임). 보여 준 뒤 지금을 '마지막으로 본 때'로 저장
 */
export function NewJobsChip({ createdAts }: { createdAts: string[] }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const since = seenBefore()
    setN(createdAts.filter((c) => isNew(c, since)).length)
    try {
      localStorage.setItem(KEY, String(Date.now()))
    } catch {}
  }, [createdAts])
  if (!n) return null
  return (
    <p className="mb-3 inline-flex animate-pop items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-sm font-bold text-rose-600 ring-1 ring-rose-100" data-new-jobs>
      🆕 지난번 이후 새 공고 {n}개
    </p>
  )
}
