import Link from 'next/link'
import BackButton from '@/components/BackButton'
import Logo from '@/components/Logo'

/** 없는 주소·지워진 공고 (관리자 화면 안의 없는 주소는 admin/not-found.tsx — 메뉴를 그대로 둠) */
export default function NotFound() {
  return (
    // 근무자 화면 안에서 뜨면 머리글·아래 메뉴가 함께 보이므로 화면 높이를 다 쓰지 않음 (카드가 아래로 밀리지 않게)
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center text-center">
      <div className="card w-full animate-pop py-7" data-404>
        <Logo className="mx-auto size-14" />
        <h1 className="mt-5 text-xl font-extrabold">찾는 화면이 없어요</h1>
        <p className="mt-2 text-sm text-sub">주소가 바뀌었거나 지워진 공고일 수 있어요.</p>
        <div className="mt-6 flex w-full gap-2">
          <Link href="/" className="btn-primary flex-1">
            모집 중인 알바
          </Link>
          <Link href="/me" className="btn-gray flex-1">
            내 근무
          </Link>
        </div>
        {/* 보던 화면이 있으면 그리로 (링크를 잘못 눌렀을 때) */}
        <BackButton fallback="/" className="mt-4 inline-block text-sm font-semibold text-sub">
          ← 보던 화면으로
        </BackButton>
      </div>
    </main>
  )
}
