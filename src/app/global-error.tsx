'use client'

import { useEffect } from 'react'
import { errorReport, ErrorCopyButton } from '@/components/ErrorCopy'
import ErrorRetry from '@/components/ErrorRetry'
import './globals.css'

/** 앱 바탕(맨 바깥 화면)에서 문제가 생겼을 때: 다시 시도 + 오류 내용 복사 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <html lang="ko">
      <body className="min-h-dvh">
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-xl font-extrabold">잠시 문제가 생겼어요</h1>
          <p className="text-sm text-sub">
            다시 시도해도 계속되면 아래 ‘오류 내용 복사’를 눌러 담당자에게 보내 주세요.
            {error.digest && <span className="mt-1 block text-xs text-mute">오류 번호 {error.digest}</span>}
          </p>
          <ErrorRetry error={error} retry={retry} />
          <ErrorCopyButton report={errorReport({ message: error.message, digest: error.digest, stack: error.stack, kind: '앱 오류' })} />
        </main>
      </body>
    </html>
  )
}
