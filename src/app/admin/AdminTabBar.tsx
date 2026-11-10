'use client'

import Icon, { type IconName } from '@/components/Icon'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'
import { useTabTarget } from '@/components/useTabTarget'

type Item = { href: string; label: string; icon: React.ReactNode; exact?: boolean }

const MAIN: Item[] = [
  { href: '/admin', label: '홈', exact: true, icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  {
    href: '/admin/jobs',
    label: '공고',
    icon: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="2.5" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </>
    ),
  },
  {
    href: '/admin/workers',
    label: '근무자',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 19.5a6 6 0 0 1 12 0M15.5 5.2a3.2 3.2 0 0 1 0 5.6M17.5 13.6a6 6 0 0 1 3.5 5.9" />
      </>
    ),
  },
  {
    href: '/admin/chat',
    label: '문의',
    icon: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />,
  },
]

/** '더보기'에 모은 덜 자주 쓰는 메뉴 */
const MORE: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin/weekly', label: '주간 근무 · 주휴', icon: 'calendar' },
  { href: '/admin/reports', label: '정산 · 신고자료', icon: 'receipt' },
  { href: '/admin/vendors', label: '외주', icon: 'building' },
  { href: '/admin/docs', label: '서류', icon: 'file' },
  { href: '/admin/settings', label: '회사 설정', icon: 'gear' },
]
/** 최상위 관리자만: '운영' 묶음 (더보기 안에서 이름표 아래 따로) · 운영센터(/ops)는 주인 한 사람만 맨 앞에 */
const OPS: { href: string; label: string; icon: IconName } = { href: '/ops', label: '운영센터 ↗', icon: 'flag' }
const SUPER: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin/companies', label: '회사 관리', icon: 'building' },
  { href: '/admin/insights', label: '인사이트', icon: 'eye' },
  { href: '/admin/community', label: '커뮤니티 관리', icon: 'shield' },
]

/**
 * 관리자 휴대폰 아래 탭 (근무자 화면과 같은 떠 있는 유리 탭): 홈 · 공고 · 근무자 · 문의 · 더보기
 * 넓은 화면은 위쪽 메뉴(AdminNav)를 그대로 씀
 */
export default function AdminTabBar({ unread = 0, joinWait = 0, isSuper = false, ops = false, reports = 0 }: { unread?: number; joinWait?: number; isSuper?: boolean; ops?: boolean; reports?: number }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  // 화면을 옮기면 '더보기'를 닫음
  useEffect(() => setOpen(false), [path])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const more = isSuper ? [...MORE, ...(ops ? [OPS] : []), ...SUPER] : MORE
  // 표시는 누른 순간 옮겨 감 (shown), 화면 읽어 주기(aria-current)는 실제 주소 기준
  const [shown, onTap] = useTabTarget(path)
  const tabAt = (p: string) => (more.some((m) => p.startsWith(m.href)) ? 4 : MAIN.findIndex((t) => (t.exact ? p === t.href : p.startsWith(t.href))))
  const at = tabAt(shown)
  const current = tabAt(path)
  const moreBadge = joinWait + (isSuper ? reports : 0)
  const count = (href: string) => (href === '/admin/settings' ? joinWait : href === '/admin/community' && isSuper ? reports : 0)

  return (
    <>
      {open && (
        <div className="no-print fixed inset-0 z-40 sm:hidden" data-admin-more data-vv="pin">
          <button type="button" aria-label="닫기" className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="더보기" className="glass absolute inset-x-3 bottom-[calc(var(--tabbar-space)+8px)] animate-slide-up rounded-[26px] p-2">
            <ul className="grid grid-cols-2 gap-1.5">
              {more.map((m, i) => {
                const on = path.startsWith(m.href)
                const n = count(m.href)
                return (
                  <Fragment key={m.href}>
                    {i === MORE.length && (
                      <li className="col-span-2 px-2 pt-1.5 text-[11px] font-bold text-mute" data-super-group>
                        운영 · 최상위 관리자
                      </li>
                    )}
                    <li>
                      <Link
                        href={m.href}
                        aria-current={on ? 'page' : undefined}
                        className={`flex items-center gap-2 rounded-[18px] px-3 py-3 text-sm font-semibold transition active:scale-95 ${on ? 'bg-brand-50 text-brand-700' : 'bg-white/70 text-ink'}`}
                      >
                        <span aria-hidden className={`text-lg ${on ? '' : 'text-sub'}`}>
                          <Icon name={m.icon} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{m.label}</span>
                        {n > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{n > 99 ? '99+' : n}</span>}
                      </Link>
                    </li>
                  </Fragment>
                )
              })}
              <li className="col-span-2">
                {/* 근무자 화면으로 바꿈 (관리자는 접속하면 관리자 화면부터라, 이 버튼으로 들어온 동안만 근무자 화면) */}
                <a href="/api/view?to=worker" className="flex items-center justify-center gap-1.5 rounded-[18px] px-3 py-2.5 text-sm font-semibold text-sub transition active:scale-95" data-to-worker>
                  👀 근무자 화면으로 보기
                </a>
              </li>
            </ul>
          </div>
        </div>
      )}
      <nav aria-label="관리자 메뉴" data-admin-tabbar data-vv="pin" className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:hidden">
        <div className="glass pointer-events-auto relative mx-auto grid h-16 max-w-md grid-cols-5 rounded-[26px] p-1.5">
          <span
            aria-hidden
            className={`absolute inset-y-1.5 left-1.5 rounded-[20px] bg-brand-50 ring-1 ring-brand-100/70 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.3,1.35,0.4,1)] ${at < 0 ? 'opacity-0' : ''}`}
            style={{ width: 'calc((100% - 12px) / 5)', transform: `translateX(${Math.max(at, 0) * 100}%)` }}
          />
          {MAIN.map((t, i) => {
            const active = i === at
            return (
              <Link
                key={t.href}
                href={t.href}
                onClick={onTap(t.href)}
                aria-current={i === current ? 'page' : undefined}
                className={`group relative flex flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-semibold transition-colors ${active ? 'text-brand-600' : 'text-mute'}`}
              >
                <span className="relative grid h-6 w-10 place-items-center transition duration-200 group-active:scale-90">
                  {/* 숫자가 바뀌면(새 문의) 배지가 다시 톡 — key로 새로 그림 */}
                  {t.href === '/admin/chat' && unread > 0 && (
                    <span key={`u${unread}`} data-nav-badge="chat" className="absolute -top-1.5 right-0 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-rose-500 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                  <svg viewBox="0 0 24 24" className={`size-[22px] ${active ? 'animate-pop' : ''}`} fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {t.icon}
                  </svg>
                </span>
                {t.label}
              </Link>
            )
          })}
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen((v) => !v)}
            className={`group relative flex flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-semibold transition-colors ${at === 4 || open ? 'text-brand-600' : 'text-mute'}`}
          >
            <span className="relative grid h-6 w-10 place-items-center transition duration-200 group-active:scale-90">
              {moreBadge > 0 && <span aria-hidden className="absolute -top-0.5 right-1.5 size-2.5 animate-pop rounded-full bg-rose-500 ring-2 ring-white" />}
              <svg viewBox="0 0 24 24" className="size-[22px]" fill="currentColor" aria-hidden>
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </span>
            더보기
          </button>
        </div>
      </nav>
    </>
  )
}
