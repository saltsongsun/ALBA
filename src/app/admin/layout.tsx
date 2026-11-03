import type { Metadata } from 'next'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import { unreadForAdmins } from '@/lib/data'
import { db } from '@/lib/db'
import { adminRoomUnreadTotal } from '@/lib/room'
import { requireAdmin } from '@/lib/session'
import AdminNav from './AdminNav'
import { CompanySwitcher } from '@/components/company'
import Logo from '@/components/Logo'
import { APP_NAME } from '@/lib/brand'
import AppBadge from '@/components/AppBadge'

export const metadata: Metadata = { title: { default: '관리자', template: `%s · ${APP_NAME} 관리자` } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  // 대표 관리자에게는 승인을 기다리는 관리자 가입 신청 수도 (회사 설정 옆에 표시)
  const owner = admin.isSuper || admin.companies.find((c) => c.id === admin.companyId)?.role === 'owner'
  const [unread, joinWait, roomUnread, reports] = await Promise.all([
    unreadForAdmins(admin.companyId),
    owner
      ? db()
          .from('company_join_requests')
          .select('user_id', { count: 'exact', head: true })
          .eq('company_id', admin.companyId)
          .then((r) => (r.error ? 0 : (r.count ?? 0)))
      : 0,
    // 단체방 안 읽은 메시지 (이 관리자 기준)
    adminRoomUnreadTotal(admin.companyId, admin.id).catch(() => 0),
    // 최고 관리자: 아직 처리 안 한 커뮤니티 신고 수 (커뮤니티 관리 옆에 표시)
    admin.isSuper
      ? db()
          .from('community_reports')
          .select('id', { count: 'exact', head: true })
          .is('resolved_at', null)
          .then((r) => (r.error ? 0 : (r.count ?? 0)))
      : 0,
  ])
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
        <AdminNav unread={unread + roomUnread} joinWait={joinWait} isSuper={admin.isSuper} reports={reports} />
        <AppBadge count={unread + roomUnread} />
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-20">{children}</main>
    </>
  )
}
