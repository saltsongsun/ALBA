import Link from 'next/link'
import BackButton from './BackButton'
import Logo from './Logo'

/** 없는 주소·지워진 공고 안내 카드 (app/not-found.tsx · 공고 화면의 not-found.tsx가 함께 씀) */
export default function NotFoundCard() {
  return (
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
      <BackButton fallback="/" className="mt-2 inline-flex min-h-10 items-center px-4 text-sm font-semibold text-sub active:opacity-60">
        ← 보던 화면으로
      </BackButton>
    </div>
  )
}
