'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { errorReport, ErrorCopyButton } from '@/components/ErrorCopy'
import ErrorRetry from '@/components/ErrorRetry'
import Logo from '@/components/Logo'
import { APP_NAME } from '@/lib/brand'

/**
 * 화면을 그리다 문제가 생겼을 때 (영어 오류 화면 대신).
 * '다시 시도'는 서버에서 화면을 다시 받아 옴(retry) — 서버·DB 연결이 잠깐 끊겼다 돌아왔을 때 실제로 되살아나게 (ErrorRetry)
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
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
      <div className="mt-6 w-full">
        <ErrorRetry error={error} retry={retry}>
          <Link href="/" className="btn-gray flex-1">
            {APP_NAME} 처음으로
          </Link>
        </ErrorRetry>
      </div>
      {/* 오류 내용을 한 번에 복사 → 담당자에게 붙여 넣으면 오류 번호로 서버 기록을 바로 찾을 수 있음 */}
      <div className="mt-3 w-full">
        <ErrorCopyButton report={errorReport({ message: error.message, digest: error.digest, stack: error.stack, kind: offline ? '인터넷 끊김' : '화면 오류' })} />
      </div>
    </main>
  )
}
