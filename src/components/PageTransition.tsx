'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * 화면 전환 — CSS만 씀 (globals.css '화면 전환').
 * 예전에는 브라우저 View Transition으로 화면을 캡처해 바꿨는데, 캡처할 때마다 화면이 잠깐 멈춰
 * 휴대폰에서 뚝뚝 끊겼음. 지금은 새 화면만 위치·투명도로 움직여서 화면을 멈추지 않음.
 * · 아래 탭으로 다른 화면: 살짝 떠오름 (tab)
 * · 더 깊이 들어가기(공고·글·대화 열기): 오른쪽에서 (forward) / 돌아가기: 왼쪽에서 (back)
 * · 처음 열 때·같은 화면 안에서 바뀔 때(거르기 칩·새로 고침)는 움직이지 않음
 * · 불러오던 회색 자리 → 실제 내용은 내용이 살짝 나타남
 * (곳곳의 Link transitionTypes는 예전 View Transition용이라 지금은 아무 영향 없음)
 */
export type NavDir = 'none' | 'tab' | 'forward' | 'back'

let prevPath: string | null = null
let tabIntent = false
/** 아래 탭을 눌렀을 때 (화면 깊이와 상관없이 '탭 이동'으로) — BottomNav·AdminTabBar */
export const markTabNav = () => {
  tabIntent = true
}

/** 아래 탭 첫 화면들 (서로 오가면 '탭 이동') */
const TAB_ROOTS = new Set([
  '/', '/me', '/community', '/me/chat', '/me/profile', '/pro', '/pro/money',
  '/admin', '/admin/jobs', '/admin/workers', '/admin/chat', '/admin/reports', '/admin/vendors', '/admin/docs', '/admin/settings', '/admin/companies', '/admin/community',
])
/** child가 parent 화면 안쪽인지 (첫 화면 '/' 아래는 공고 화면) */
const under = (child: string, parent: string) => (parent === '/' ? child.startsWith('/jobs/') : child.startsWith(`${parent}/`))
const depth = (p: string) => p.split('/').filter(Boolean).length

export function navDirection(from: string | null, to: string, tab: boolean): NavDir {
  if (!from || from === to) return 'none'
  if (tab || (TAB_ROOTS.has(from) && TAB_ROOTS.has(to))) return 'tab'
  if (under(to, from)) return 'forward'
  if (under(from, to)) return 'back'
  return depth(to) > depth(from) ? 'forward' : depth(to) < depth(from) ? 'back' : 'tab'
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  // 주소가 바뀔 때마다 새 칸 (template는 '/community' → '/community/글'처럼 앞부분이 같으면 다시 그려지지 않으므로)
  return (
    <PageIn key={path} path={path}>
      {children}
    </PageIn>
  )
}

function PageIn({ path, children }: { path: string; children: React.ReactNode }) {
  // 새 칸을 처음 그릴 때 한 번만 방향을 정함
  const [dir] = useState<NavDir>(() => {
    const d = navDirection(prevPath, path, tabIntent)
    tabIntent = false
    return d
  })
  useEffect(() => {
    prevPath = path
  }, [path])
  return (
    <div className="page-in" data-dir={dir}>
      {children}
    </div>
  )
}
