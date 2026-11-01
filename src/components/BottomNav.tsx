'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
  TABS[2],
  TABS[3],
]
/** 외주 업체: 홈 · 견적·대금 · 문의 · 내 정보 */
const VENDOR_TABS: Tab[] = [
  { href: '/pro', label: '홈', on: (p) => p === '/pro', icon: HOME },
  { href: '/pro/money', label: '견적·대금', on: (p) => p.startsWith('/pro/money') || p.startsWith('/quote'), icon: MONEY },
  TABS[2],
  TABS[3],
]

/** 휴대폰 아래쪽 탭 (로그인한 회원). 아르바이트·전문가·외주 업체마다 탭이 다름 */
export default function BottomNav({ unread = 0, todo = 0, mode = 'worker' }: { unread?: number; todo?: number; mode?: 'worker' | 'expert' | 'vendor' }) {
  const path = usePathname()
  const tabs = mode === 'expert' ? EXPERT_TABS : mode === 'vendor' ? VENDOR_TABS : TABS
  return (
    <nav aria-label="주요 메뉴" data-bottom-nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className={`mx-auto grid max-w-xl ${tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {tabs.map((t) => {
          const active = t.on(path)
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`group flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-semibold transition-colors ${active ? 'text-brand-600' : 'text-mute'}`}
            >
              <span className={`relative grid h-7 w-12 place-items-center rounded-full transition duration-200 group-active:scale-90 ${active ? 'bg-brand-50' : ''}`}>
                {/* 안 읽은 담당자 답장 */}
                {t.href === '/me/chat' && unread > 0 && (
                  <span className="absolute -top-1 right-1 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-rose-500 px-1 text-[10px] leading-none font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
                {/* 해야 할 일 (서명·시간 변경 답·연장 확인) */}
                {t.href === '/me' && todo > 0 && (
                  <span className="absolute -top-1 right-1 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-amber-500 px-1 text-[10px] leading-none font-bold text-white">
                    {todo > 9 ? '9+' : todo}
                  </span>
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
