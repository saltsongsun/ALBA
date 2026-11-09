import type { Metadata } from 'next'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import Logo from '@/components/Logo'
import { APP_NAME } from '@/lib/brand'
import { requireOpsOwner } from '@/lib/session'

export const metadata: Metadata = {
  title: { default: '운영센터', template: `%s · ${APP_NAME} 운영센터` },
  robots: { index: false, follow: false },
}

/**
 * 운영센터: 모든 회사를 한눈에 보는 화면 — 회사 관리자 화면(/admin)과 완전히 따로
 * 회사 고르기·관리자 메뉴·아래 탭 없이 · 최상위 관리자 한 사람만 (lib/owner · 다른 사람은 404)
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOpsOwner()
  return (
    <>
      <header data-app-header data-ops-header className="no-print sticky top-0 z-20 bg-ink text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
          <Link href="/ops" className="flex min-w-0 items-center gap-2.5 text-[17px] font-extrabold whitespace-nowrap" aria-label={`${APP_NAME} 운영센터`}>
            <Logo mono />
            <span>운영센터</span>
            <span className="hidden truncate text-sm font-semibold text-white/60 sm:inline">{APP_NAME} 전체</span>
          </Link>
          <div className="flex shrink-0 items-center gap-0.5 text-sm whitespace-nowrap">
            <span className="hidden text-white/60 sm:inline">{owner.name}</span>
            <Link href="/admin" className="rounded-lg px-2 py-1.5 font-semibold text-white/90 hover:bg-white/10" data-ops-to-admin>
              관리자 화면
            </Link>
            <LogoutButton className="rounded-lg px-2 py-1.5 text-white/60 hover:bg-white/10" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-16" data-ops-main>
        {children}
      </main>
    </>
  )
}
