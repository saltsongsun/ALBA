import BottomNav from '@/components/BottomNav'
import SiteHeader from '@/components/SiteHeader'
import { overdueShiftFor, todoForWorker, unreadForWorker } from '@/lib/data'
import ClockOutPrompt from '@/components/ClockOutPrompt'
import { getUser } from '@/lib/session'
import AppBadge from '@/components/AppBadge'
import { isPro } from '@/lib/members'
import PullToRefresh from '@/components/PullToRefresh'
import ScrollTop from '@/components/ScrollTop'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

/** 아래 탭 '커뮤니티'에 새 글 점: 마지막으로 본 뒤에 남이 쓴 글이 있으면 (못 읽으면 표시 안 함) */
async function communityNew(userId: string): Promise<boolean> {
  try {
    const seen = (await cookies()).get('cm_seen')?.value
    const { data } = await db().from('community_posts').select('created_at, author_id').is('hidden_at', null).neq('author_id', userId).order('created_at', { ascending: false }).limit(1)
    const latest = ((data ?? []) as { created_at: string; author_id: string }[]).filter((p) => p.author_id !== userId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    return !!latest && (!seen || latest.created_at > decodeURIComponent(seen))
  } catch {
    return false
  }
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  // 전문가·외주 업체는 보라색 화면 + 다른 아래 탭 (아르바이트 화면과 한눈에 구분)
  const pro = user && user.role !== 'admin' && isPro(user.memberType)
  const [unread, todo, cmNew, overdue] = user
    ? await Promise.all([
        unreadForWorker(user.id),
        todoForWorker(user.id),
        !pro && user.role !== 'admin' ? communityNew(user.id) : false,
        // 종료 시각이 지났는데 아직 근무 중 → 어느 화면에서든 근무 종료를 누르라고 (외주 업체는 출퇴근이 없음)
        user.memberType !== 'vendor' ? overdueShiftFor(user.id).catch(() => null) : null,
      ])
    : [0, 0, false, null]
  return (
    <div data-mode={pro ? 'pro' : undefined} className="contents">
      <SiteHeader />
      {/* 아래 여백 = 아래 탭 높이 + 16px (키보드가 올라와 탭이 숨으면 함께 줄어 입력칸이 키보드 바로 위에) */}
      <main className={`mx-auto max-w-xl px-4 pt-5 ${user ? 'pb-[calc(var(--tabbar-space)+16px)] sm:pb-16' : 'pb-16'}`}>{children}</main>
      {user && <BottomNav unread={unread} todo={todo} communityNew={cmNew} mode={user.role === 'admin' ? 'worker' : user.memberType} />}
      {user && <AppBadge count={unread + todo} />}
      {overdue && <ClockOutPrompt endText={overdue.endText} title={overdue.title} />}
      {/* 설치한 앱에서 맨 위에서 당기면 새로 고침 */}
      {user && <PullToRefresh />}
      <ScrollTop />
    </div>
  )
}
