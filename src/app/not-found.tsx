import Link from 'next/link'
import Logo from '@/components/Logo'

/** 없는 주소·지워진 공고 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo className="size-14" />
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
    </main>
  )
}
