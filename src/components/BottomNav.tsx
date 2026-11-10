'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTabTarget } from './useTabTarget'

type Tab = { href: string; label: string; on: (path: string) => boolean; icon: React.ReactNode }

const TABS: Tab[] = [
  {
    href: '/',
    label: '알바 찾기',
    on: (p) => p === '/' || p.startsWith('/jobs'),
    icon: <path d="M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z" />,
  },
  {
    href: '/me',
    label: '내 근무',
    on: (p) => p === '/me' || p.startsWith('/me/history') || p.startsWith('/docs') || p.startsWith('/print'),
    icon: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2.5" />
        <path d="M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7M3 12.5h18" />
      </>
    ),
  },
  {
    href: '/community',
    label: '커뮤니티',
    on: (p) => p.startsWith('/community'),
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 19.5a6 6 0 0 1 12 0M15.5 5.2a3.2 3.2 0 0 1 0 5.6M17.5 13.6a6 6 0 0 1 3.5 5.9" />
      </>
    ),
  },
  {
    href: '/me/chat',
    label: '문의',
    on: (p) => p.startsWith('/me/chat'),
    icon: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />,
  },
  {
    href: '/me/profile',
    label: '내 정보',
    on: (p) => p.startsWith('/me/profile'),
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  },
]

const SEARCH = <path d="M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z" />
const MONEY = (
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v.01M18 14.5v.01" />
  </>
)
const HOME = <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />

/** 전문가: 의뢰 찾기 · 내 일 · 견적·대금 · 문의 · 내 정보 */
const EXPERT_TABS: Tab[] = [
  { href: '/pro', label: '의뢰 찾기', on: (p) => p === '/pro' || p.startsWith('/jobs'), icon: SEARCH },
  { ...TABS[1], label: '내 일' },
  { href: '/pro/money', label: '견적·대금', on: (p) => p.startsWith('/pro/money') || p.startsWith('/quote'), icon: MONEY },
  TABS[3],
  TABS[4],
]
/** 외주 업체: 홈 · 견적·대금 · 문의 · 내 정보 */
const VENDOR_TABS: Tab[] = [
  { href: '/pro', label: '홈', on: (p) => p === '/pro', icon: HOME },
  { href: '/pro/money', label: '견적·대금', on: (p) => p.startsWith('/pro/money') || p.startsWith('/quote'), icon: MONEY },
  TABS[3],
  TABS[4],
]

/** 휴대폰 아래쪽 탭 (로그인한 회원). 아르바이트·전문가·외주 업체마다 탭이 다름 (아르바이트: 알바 찾기·내 근무·커뮤니티·문의·내 정보) */
export default function BottomNav({ unread = 0, todo = 0, communityNew = false, mode = 'worker' }: { unread?: number; todo?: number; communityNew?: boolean; mode?: 'worker' | 'expert' | 'vendor' }) {
  const path = usePathname()
  // 이번에 커뮤니티를 한 번 열었으면 새 글 점을 끔 (화면을 옮겨도 아래 탭은 다시 그려지지 않으므로)
  const [cmSeen, setCmSeen] = useState(false)
  useEffect(() => {
    if (path.startsWith('/community')) setCmSeen(true)
  }, [path])
  const tabs = mode === 'expert' ? EXPERT_TABS : mode === 'vendor' ? VENDOR_TABS : TABS
  // 표시는 누른 순간 옮겨 감 (shown), 화면 읽어 주기(aria-current)는 실제 주소 기준
  const [shown, onTap] = useTabTarget(path)
  const at = tabs.findIndex((t) => t.on(shown))
  const current = tabs.findIndex((t) => t.on(path))
  return (
    // 화면 아래에 떠 있는 유리 탭 (iOS 26 느낌): 뒤 내용이 흐리게 비치고, 누른 탭 표시가 미끄러지듯 옮겨 감
    <nav aria-label="주요 메뉴" data-bottom-nav data-vv="pin" className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:hidden">
      <div className={`glass pointer-events-auto relative mx-auto grid h-16 max-w-md rounded-[26px] p-1.5 ${tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        <span
          aria-hidden
          data-tab-indicator
          className={`absolute inset-y-1.5 left-1.5 rounded-[20px] bg-brand-50 ring-1 ring-brand-100/70 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.3,1.35,0.4,1)] ${at < 0 ? 'opacity-0' : ''}`}
          style={{ width: `calc((100% - 12px) / ${tabs.length})`, transform: `translateX(${Math.max(at, 0) * 100}%)` }}
        />
        {tabs.map((t, i) => {
          const active = i === at
          return (
            <Link
              key={t.href}
              href={t.href}
              onClick={(e) => {
                // 지금 보고 있는 탭을 또 누르면 맨 위로 (휴대폰 앱처럼). 아무 반응이 없어 여러 번 누르던 것
                // 단, 문의 탭에서 한 회사와의 대화(?co=…)를 보고 있으면 대화 목록으로 (인사이트: 대화 안에서 문의 탭을 여러 번 누름)
                const inThread = t.href === '/me/chat' && location.search.length > 1
                if (path === t.href && !inThread && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                  e.preventDefault()
                  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
                  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
                  return
                }
                onTap(t.href)(e)
              }}
              aria-current={i === current ? 'page' : undefined}
              className={`group relative flex flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-semibold transition-colors ${active ? 'text-brand-600' : 'text-mute'}`}
            >
              <span className="relative grid h-6 w-10 place-items-center transition duration-200 group-active:scale-90">
                {/* 안 읽은 담당자 답장 */}
                {/* 숫자가 바뀌면(새 답장 등) 배지가 다시 톡 — key로 새로 그림 */}
                {t.href === '/me/chat' && unread > 0 && (
                  <span key={`u${unread}`} data-nav-badge="chat" className="absolute -top-1.5 right-0 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-rose-500 ring-2 ring-white px-1 text-[10px] leading-none font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
                {/* 해야 할 일 (서명·시간 변경 답·연장 확인) */}
                {t.href === '/me' && todo > 0 && (
                  <span key={`t${todo}`} data-nav-badge="todo" className="absolute -top-1.5 right-0 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-amber-500 ring-2 ring-white px-1 text-[10px] leading-none font-bold text-white">
                    {todo > 9 ? '9+' : todo}
                  </span>
                )}
                {/* 커뮤니티 새 글 (지금 커뮤니티를 보고 있으면 숨김) */}
                {t.href === '/community' && communityNew && !cmSeen && !active && (
                  <span aria-label="새 글" data-community-dot className="absolute -top-0.5 right-1 size-2.5 animate-pop rounded-full bg-rose-500 ring-2 ring-white" />
                )}
                {/* 활성 탭이 바뀌면 아이콘이 톡 튀어나옴 */}
                <svg
                  key={String(active)}
                  viewBox="0 0 24 24"
                  className={`size-[22px] ${active ? 'animate-pop' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.4 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {t.icon}
                </svg>
              </span>
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
