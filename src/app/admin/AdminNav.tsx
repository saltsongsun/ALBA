'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/admin', label: '대시보드', exact: true },
  { href: '/admin/jobs', label: '공고 · 출퇴근' },
  { href: '/admin/workers', label: '근무자' },
  { href: '/admin/chat', label: '문의' },
  { href: '/admin/reports', label: '정산 · 신고자료' },
  { href: '/admin/docs', label: '서류 서식' },
  { href: '/admin/settings', label: '회사 설정' },
]

export default function AdminNav({ unread = 0 }: { unread?: number }) {
  const path = usePathname()
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 text-sm font-semibold">
      {ITEMS.map((it) => {
        const active = it.exact ? path === it.href : path.startsWith(it.href)
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`shrink-0 rounded-lg px-3 py-1.5 transition duration-200 active:scale-95 ${active ? 'bg-ink text-white shadow-sm' : 'text-sub hover:bg-bg'}`}
          >
            {it.label}
            {/* 안 읽은 근무자 문의 */}
            {it.href === '/admin/chat' && unread > 0 && (
              <span className="ml-1 inline-grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-rose-500 px-1 align-[1px] text-[10px] leading-none font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
