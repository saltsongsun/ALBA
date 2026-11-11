import Link from 'next/link'
import { Suspense } from 'react'
import GuestLinks from './GuestLinks'
import { unreadForWorker } from '@/lib/data'
import { getUser } from '@/lib/session'
import LogoutButton from './LogoutButton'
import Logo from './Logo'
import TopLink from './TopLink'
import { APP_NAME } from '@/lib/brand'

export default async function SiteHeader() {
  const user = await getUser()
  const unread = user ? await unreadForWorker(user.id) : 0
  return (
    <header data-app-header data-vv="pin" className="no-print scroll-shadow sticky top-0 z-20 border-b border-black/[0.05] bg-white/70 backdrop-blur-xl backdrop-saturate-[1.8]">
      <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
        <TopLink href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
          <Logo />
          {APP_NAME}
        </TopLink>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          {user ? (
            <>
              {user.role === 'admin' && (
                // 관리자 화면으로 돌아감 (근무자 화면 표시를 지워 다음 접속은 다시 관리자 화면부터)
                <a href="/api/view?to=admin" className="rounded-lg px-2.5 py-1.5 text-brand-700 hover:bg-brand-50" data-to-admin>
                  관리자
                </a>
              )}
              {/* 휴대폰에서는 아래 탭에 있으므로 넓은 화면에서만 */}
              <Link href="/me" className="hidden rounded-lg px-2.5 py-1.5 hover:bg-bg sm:inline">
                내 근무
              </Link>
              <Link href="/community" className="hidden rounded-lg px-2.5 py-1.5 hover:bg-bg sm:inline">
                커뮤니티
              </Link>
              <Link href="/me/chat" className="hidden rounded-lg px-2.5 py-1.5 hover:bg-bg sm:inline">
                문의
                {unread > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-bold text-white">{unread}</span>}
              </Link>
              <LogoutButton className="rounded-lg px-2.5 py-1.5 text-mute hover:bg-bg" />
            </>
          ) : (
            // 보던 공고·회사 공고 모음으로 돌아오게 주소를 붙임 (주소를 읽기 전에는 기본 링크)
            <Suspense
              fallback={
                <>
                  <Link href="/login" className="rounded-lg px-2.5 py-1.5 hover:bg-bg">
                    로그인
                  </Link>
                  <Link href="/signup" className="btn-primary btn-sm">
                    가입하기
                  </Link>
                </>
              }
            >
              <GuestLinks />
            </Suspense>
          )}
        </nav>
      </div>
    </header>
  )
}
