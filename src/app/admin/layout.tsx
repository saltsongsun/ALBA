import type { Metadata } from 'next'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import { unreadForAdmins } from '@/lib/data'
import { requireAdmin } from '@/lib/session'
import AdminNav from './AdminNav'
import { CompanySwitcher } from '@/components/company'
import Logo from '@/components/Logo'
import { APP_NAME } from '@/lib/brand'
import AppBadge from '@/components/AppBadge'

export const metadata: Metadata = { title: { default: '관리자', template: `%s · ${APP_NAME} 관리자` } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const unread = await unreadForAdmins(admin.companyId)
  return (
    <>
      <header className="no-print scroll-shadow sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/admin" className="flex shrink-0 items-center gap-2 text-[17px] font-extrabold whitespace-nowrap">
            <Logo mono />
            {APP_NAME} <span className="hidden text-sm font-semibold text-mute min-[400px]:inline">관리자</span>
          </Link>
          <div className="flex items-center gap-0.5 text-sm whitespace-nowrap">
            <span className="hidden text-mute sm:inline">{admin.name}</span>
            <Link href="/" className="rounded-lg px-2 py-1.5 font-semibold hover:bg-bg">
              근무자 화면
            </Link>
            <LogoutButton className="rounded-lg px-2 py-1.5 text-mute hover:bg-bg" />
          </div>
        </div>
        {/* 여러 회사를 운영하면 회사 고르기, 하나면 회사 이름만 */}
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-1.5">
          {admin.companies.length > 1 ? (
            <CompanySwitcher companies={admin.companies} current={admin.companyId} />
          ) : (
            <p className="truncate text-sm font-semibold text-sub">🏢 {admin.companyName}</p>
          )}
        </div>
        <AdminNav unread={unread} isSuper={admin.isSuper} />
        <AppBadge count={unread} />
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-20">{children}</main>
    </>
  )
}
