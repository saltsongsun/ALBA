import Link from 'next/link'
import { getUser } from '@/lib/session'
import { logout } from '@/app/actions/auth'

export default async function SiteHeader() {
  const user = await getUser()
  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
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
              <Link href="/me" className="rounded-lg px-2.5 py-1.5 hover:bg-bg">
                내 근무
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
