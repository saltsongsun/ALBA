import type { Metadata } from 'next'
import Link from 'next/link'
import { logout } from '@/app/actions/auth'
import { unreadForAdmins } from '@/lib/data'
import { requireAdmin } from '@/lib/session'
import AdminNav from './AdminNav'

export const metadata: Metadata = { title: { default: '관리자', template: '%s · 소켓 알바 관리자' } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, unread] = await Promise.all([requireAdmin(), unreadForAdmins()])
  return (
    <>
      <header className="no-print scroll-shadow sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/admin" className="flex shrink-0 items-center gap-2 text-[17px] font-extrabold whitespace-nowrap">
            <span className="grid size-7 place-items-center rounded-lg bg-ink text-sm text-white">S</span>
            소켓 알바 <span className="hidden text-sm font-semibold text-mute min-[400px]:inline">관리자</span>
          </Link>
          <div className="flex items-center gap-0.5 text-sm whitespace-nowrap">
            <span className="hidden text-mute sm:inline">{admin.name}</span>
            <Link href="/" className="rounded-lg px-2 py-1.5 font-semibold hover:bg-bg">
              근무자 화면
            </Link>
            <form action={logout}>
              <button className="rounded-lg px-2 py-1.5 text-mute hover:bg-bg">로그아웃</button>
            </form>
          </div>
        </div>
        <AdminNav unread={unread} />
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-20">{children}</main>
    </>
  )
}
