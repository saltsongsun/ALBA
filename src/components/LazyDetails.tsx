'use client'

import { useState } from 'react'

/**
 * 접힌 칸: 처음 펼칠 때 안의 내용을 그림 (한 번 펼친 뒤로는 그대로 둠).
 * 접힌 확정·미선발 칸에 수백 명 카드를 미리 그려 두느라 지원자 화면이 느리던 것 (사용자 요청 2026-11-16)
 */
export default function LazyDetails({
  summary,
  children,
  className,
  summaryClassName,
  group,
}: {
  summary: React.ReactNode
  children: React.ReactNode
  className?: string
  summaryClassName?: string
  /** data-app-group 이름 (테스트·화면 찾기용) */
  group?: string
}) {
  const [seen, setSeen] = useState(false)
  return (
    <details
      className={className}
      data-app-group={group}
      onToggle={(e) => {
        if (e.currentTarget.open) setSeen(true)
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      {seen && children}
    </details>
  )
}
