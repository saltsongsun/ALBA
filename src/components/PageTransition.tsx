'use client'

import { usePathname } from 'next/navigation'
import { ViewTransition } from 'react'

// 링크에 붙인 이동 방향 (깊이 들어가기 → 오른쪽에서, 돌아가기 → 왼쪽에서)
const DIRECTIONS = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back' } as const

/**
 * 화면 전환 (React ViewTransition + 브라우저 View Transitions)
 * · 다른 화면으로 가면: 이전 내용은 빠르게 흐려지고 새 내용이 살짝 떠오르며 나타남
 * · 방향이 붙은 링크(공고·글·대화 열기 / ← 돌아가기)는 옆으로 밀리듯
 * · 같은 화면에서 거르기·자동 새로 고침은 움직이지 않음
 * 머리글·아래 탭은 바깥(레이아웃)에 있어 그대로 있음. 지원하지 않는 브라우저는 예전처럼 떠오르기만 (globals.css)
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <ViewTransition
      key={path}
      enter={{ ...DIRECTIONS, default: 'page' }}
      exit={{ ...DIRECTIONS, default: 'page' }}
      update={{ ...DIRECTIONS, default: 'none' }}
      default="none"
    >
      <div className="page-rise">{children}</div>
    </ViewTransition>
  )
}
