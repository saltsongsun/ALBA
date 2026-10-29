import Link from 'next/link'
import { unreadForWorker } from '@/lib/data'
import { getUser } from '@/lib/session'
import { logout } from '@/app/actions/auth'

export default async function SiteHeader() {
  const user = await getUser()
  const unread = user ? await unreadForWorker(user.id) : 0
  return (
    <header className="no-print scroll-shadow sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">S</span>
          소켓 알바
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link href="/admin" className="rounded-lg px-2.5 py-1.5 text-brand-700 hover:bg-brand-50">
                  관리자
                </Link>
              )}
              {/* 휴대폰에서는 아래 탭에 있으므로 넓은 화면에서만 */}
              <Link href="/me" className="hidden rounded-lg px-2.5 py-1.5 hover:bg-bg sm:inline">
                내 근무
              </Link>
              <Link href="/me/chat" className="hidden rounded-lg px-2.5 py-1.5 hover:bg-bg sm:inline">
                문의
                {unread > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-bold text-white">{unread}</span>}
              </Link>
              <form action={logout}>
                <button className="rounded-lg px-2.5 py-1.5 text-mute hover:bg-bg">로그아웃</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-2.5 py-1.5 hover:bg-bg">
                로그인
              </Link>
              <Link href="/signup" className="btn-primary btn-sm">
                가입하기
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
