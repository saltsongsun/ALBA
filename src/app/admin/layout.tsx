import Icon from '@/components/Icon'
import type { Metadata } from 'next'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import { otherCompaniesUnread, unreadForAdmins } from '@/lib/data'
import { db } from '@/lib/db'
import { adminRoomUnreadTotal } from '@/lib/room'
import { requireAdmin } from '@/lib/session'
import AdminNav from './AdminNav'
import { CompanySwitcher } from '@/components/company'
import Logo from '@/components/Logo'
import AdminTabBar from './AdminTabBar'
import { APP_NAME } from '@/lib/brand'
import AppBadge from '@/components/AppBadge'

export const metadata: Metadata = { title: { default: '관리자', template: `%s · ${APP_NAME} 관리자` } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  // 대표 관리자에게는 승인을 기다리는 관리자 가입 신청 수도 (회사 설정 옆에 표시)
  const owner = admin.isSuper || admin.companies.find((c) => c.id === admin.companyId)?.role === 'owner'
  const [unread, joinWait, roomUnread, reports, others] = await Promise.all([
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
    // 여러 회사를 맡았으면 다른 회사의 새 문의 (회사 고르기에 표시)
    admin.companies.length > 1 ? otherCompaniesUnread(admin.companies, admin.companyId) : Promise.resolve([]),
  ])
  return (
    <>
      <header data-app-header data-vv="pin" className="no-print scroll-shadow sticky top-0 z-20 border-b border-black/[0.05] bg-white/75 backdrop-blur-xl backdrop-saturate-[1.8]">
        {/* 한 줄: 로고 · 회사(여럿이면 고르기) · 근무자 화면 · 로그아웃 */}
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/admin" aria-label={`${APP_NAME} 관리자 홈`} className="flex shrink-0 items-center gap-2 text-[17px] font-extrabold whitespace-nowrap">
              <Logo mono />
              <span className="hidden sm:inline">
                {APP_NAME} <span className="text-sm font-semibold text-mute">관리자</span>
              </span>
            </Link>
            {admin.companies.length > 1 ? (
              <CompanySwitcher companies={admin.companies} current={admin.companyId} unread={Object.fromEntries(others.map((o) => [o.id, o.n]))} />
            ) : (
              <p className="min-w-0 truncate text-[15px] font-bold">
                <Icon name="building" className="text-mute" /> {admin.companyName}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 text-sm whitespace-nowrap">
            <span className="hidden text-mute lg:inline">{admin.name}</span>
            {/* 휴대폰에서는 아래 탭 '더보기' 안에 */}
            <Link href="/" className="hidden rounded-lg px-2 py-1.5 font-semibold hover:bg-bg sm:inline">
              근무자 화면
            </Link>
            <LogoutButton className="rounded-lg px-2 py-1.5 text-mute hover:bg-bg" />
          </div>
        </div>
        {/* 넓은 화면은 위쪽 메뉴, 휴대폰은 아래 탭 (AdminTabBar) */}
        <AdminNav unread={unread + roomUnread} joinWait={joinWait} isSuper={admin.isSuper} reports={reports} />
        <AppBadge count={unread + roomUnread} />
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-28 sm:pb-20">{children}</main>
      <AdminTabBar unread={unread + roomUnread} joinWait={joinWait} isSuper={admin.isSuper} reports={reports} />
    </>
  )
}
