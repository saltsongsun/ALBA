'use client'

import { usePathname } from 'next/navigation'
import { ViewTransition } from 'react'

/**
 * 화면 전환 (React ViewTransition). 모양은 globals.css '화면 전환'.
 * · 아래 탭으로 다른 화면: 이전 내용은 빠르게 흐려지고 새 내용이 살짝 떠오름 ('page')
 * · 공고·글·대화 열기 Link transitionTypes={['nav-forward']}: 오른쪽에서 / ← 돌아가기 ['nav-back']: 왼쪽에서
 * · 휴대폰 뒤로 가기(버튼·밀기)는 Next가 전환 없이 바로 바꿈 → 브라우저·휴대폰이 보여 주는 모양 그대로 (두 번 움직이지 않음)
 * · 같은 화면 안에서 바뀌는 것(거르기 칩·새로 고침)은 움직이지 않음
 */
const DIRECTIONS = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back' } as const

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <ViewTransition key={path} enter={{ ...DIRECTIONS, default: 'page' }} exit={{ ...DIRECTIONS, default: 'page' }} update={{ ...DIRECTIONS, default: 'none' }} default="none">
      <div className="page-rise">{children}</div>
    </ViewTransition>
  )
}

/**
 * 불러오는 동안의 회색 자리(Skeleton). 실제 내용이 오면 회색 자리가 부드럽게 사라지며 내용으로 바뀜 (뚝 바뀌지 않게).
 * 화면에 들어올 때는 바깥 화면 전환에 맡김
 */
export function SkeletonFade({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="none" exit="skeleton-out" update="none" default="none">
      {children}
    </ViewTransition>
  )
}
