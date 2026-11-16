'use client'

import { useState } from 'react'

/**
 * 접어 둔 <details> — 안의 내용은 처음 펼칠 때 그림 (접혀 있는 동안은 아예 만들지 않음 · 한 번 펼치면 접어도 그대로 둠).
 * 지원자 탭의 '확정 450명'처럼 접어 둔 칸에 카드가 수백 장 들어갈 때, 화면을 다시 그리는 일을 보이는 만큼으로 줄임.
 * 누르는 순간(click) 바로 그려서 펼쳐질 때 빈 칸이 보이지 않게 함 · 다른 방법으로 열려도(toggle) 그림
 */
export default function LazyDetails({
  summary,
  summaryClassName,
  children,
  ...rest
}: Omit<React.ComponentProps<'details'>, 'children' | 'open' | 'onToggle'> & {
  summary: React.ReactNode
  summaryClassName?: string
  children: React.ReactNode
}) {
  const [seen, setSeen] = useState(false)
  return (
    <details {...rest} onToggle={(e) => e.currentTarget.open && setSeen(true)}>
      <summary className={summaryClassName} onClick={() => setSeen(true)}>
        {summary}
      </summary>
      {seen && children}
    </details>
  )
}
