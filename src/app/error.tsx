'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import Logo from '@/components/Logo'
import { APP_NAME } from '@/lib/brand'

/** 화면을 그리다 문제가 생겼을 때 (영어 오류 화면 대신) */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo className="size-14" />
      <h1 className="mt-5 text-xl font-extrabold">{offline ? '인터넷 연결이 끊겼어요' : '잠시 문제가 생겼어요'}</h1>
      <p className="mt-2 text-sm text-sub">
        {offline ? '와이파이나 데이터를 켠 뒤 다시 시도해 주세요.' : '다시 시도해도 계속되면 담당자에게 알려 주세요.'}
        {error.digest && <span className="mt-1 block text-xs text-mute">오류 번호 {error.digest}</span>}
      </p>
      <div className="mt-6 flex w-full gap-2">
        <button type="button" onClick={reset} className="btn-primary flex-1">
          다시 시도
        </button>
        <Link href="/" className="btn-gray flex-1">
          {APP_NAME} 처음으로
        </Link>
      </div>
    </main>
  )
}
