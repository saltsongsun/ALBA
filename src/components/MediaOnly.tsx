'use client'

import { useSyncExternalStore } from 'react'

/**
 * 화면 너비 조건(query)에 맞을 때만 안의 내용을 그림.
 * 휴대폰 카드와 PC 표를 둘 다 만들어 CSS로 하나를 숨기던 목록은, 사람이 수백 명이면 숨긴 쪽까지 다시 그리느라 느렸음
 * (사용자 요청 2026-11-16 "지원자 화면 다시 그리는 것도 고쳐줘"). 서버에서는 너비를 모르므로 처음엔 둘 다 그리고, 열리자마자 안 맞는 쪽을 뺌
 */
export default function MediaOnly({ query, children }: { query: string; children: React.ReactNode }) {
  const on = useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(query).matches,
    () => true,
  )
  return on ? children : null
}
