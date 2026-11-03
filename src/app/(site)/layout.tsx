import BottomNav from '@/components/BottomNav'
import SiteHeader from '@/components/SiteHeader'
import { todoForWorker, unreadForWorker } from '@/lib/data'
import { getUser } from '@/lib/session'
import AppBadge from '@/components/AppBadge'
import { isPro } from '@/lib/members'
import PullToRefresh from '@/components/PullToRefresh'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  const [unread, todo] = user ? await Promise.all([unreadForWorker(user.id), todoForWorker(user.id)]) : [0, 0]
  // 전문가·외주 업체는 보라색 화면 + 다른 아래 탭 (아르바이트 화면과 한눈에 구분)
  const pro = user && user.role !== 'admin' && isPro(user.memberType)
  return (
    <div data-mode={pro ? 'pro' : undefined} className="contents">
      <SiteHeader />
      <main className={`mx-auto max-w-xl px-4 pt-5 ${user ? 'pb-28 sm:pb-16' : 'pb-16'}`}>{children}</main>
      {user && <BottomNav unread={unread} todo={todo} mode={user.role === 'admin' ? 'worker' : user.memberType} />}
      {user && <AppBadge count={unread + todo} />}
      {/* 설치한 앱에서 맨 위에서 당기면 새로 고침 */}
      {user && <PullToRefresh />}
    </div>
  )
}
