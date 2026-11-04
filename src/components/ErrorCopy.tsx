'use client'

import { useEffect, useState } from 'react'

/** 오류 보고 글: 담당자·개발자에게 그대로 붙여 넣으면 서버 기록(오류 번호)으로 바로 찾을 수 있게 */
export function errorReport(o: { message?: string; digest?: string; stack?: string; kind?: string }): string {
  const now = new Date()
  const kst = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  const dpl = typeof document !== 'undefined' ? document.documentElement.dataset.dplId : undefined
  const firstStack = (o.stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('at '))
    .slice(0, 3)
    .join(' | ')
  return [
    '[해피워크 오류 보고]',
    `시각: ${kst} (한국)`,
    `화면: ${typeof location !== 'undefined' ? location.href : '-'}`,
    o.kind && `종류: ${o.kind}`,
    o.digest && `오류 번호: ${o.digest}`,
    `내용: ${(o.message || '알 수 없는 오류').slice(0, 500)}`,
    firstStack && `위치: ${firstStack.slice(0, 400)}`,
    `기기: ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`,
    `연결: ${typeof navigator !== 'undefined' ? (navigator.onLine ? '온라인' : '오프라인') : '-'}`,
    dpl && `버전: ${dpl}`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 클립보드 권한이 없을 때 (오래된 브라우저·앱 안 브라우저)
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** 오류 화면의 '오류 내용 복사' 버튼 + 펼쳐 보기 (복사가 안 되면 길게 눌러 직접 복사) */
export function ErrorCopyButton({ report, className = 'btn-soft w-full' }: { report: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle')
  return (
    <div className="w-full space-y-2 text-left">
      <button
        type="button"
        className={className}
        onClick={async () => {
          setState((await copyText(report)) ? 'done' : 'fail')
          setTimeout(() => setState('idle'), 2500)
        }}
      >
        {state === 'done' ? '복사됐어요 ✓ 담당자에게 붙여 넣어 보내 주세요' : state === 'fail' ? '복사가 안 돼요 · 아래 내용을 길게 눌러 복사해 주세요' : '📋 오류 내용 복사'}
      </button>
      <details className="rounded-xl bg-bg px-3 py-2 text-xs" open={state === 'fail'}>
        <summary className="cursor-pointer font-semibold text-sub">오류 내용 보기</summary>
        <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-ink select-all">{report}</pre>
      </details>
    </div>
  )
}

/**
 * 화면은 그대로인데 뒤에서 오류가 났을 때 (버튼 처리 중 등): 아래에 '문제가 생겼어요 · 오류 복사' 알림.
 * 우리 앱 코드에서 난 오류만 (브라우저 확장·광고 스크립트 오류는 무시)
 */
export function ErrorToast() {
  const [report, setReport] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const ours = (file?: string) => !file || file.startsWith(location.origin)
    const ignore = (msg: string) => /ResizeObserver loop|Script error\.?$|NEXT_REDIRECT|NEXT_NOT_FOUND|AbortError/i.test(msg)
    const onError = (e: ErrorEvent) => {
      const msg = e.message || e.error?.message || ''
      if (!ours(e.filename) || ignore(msg)) return
      setReport(errorReport({ message: msg, stack: e.error?.stack, kind: '화면 처리 오류' }))
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string; digest?: string } | string | undefined
      const msg = typeof r === 'string' ? r : r?.message ?? ''
      if (ignore(msg) || (typeof r === 'object' && typeof r?.digest === 'string' && r.digest.startsWith('NEXT_'))) return
      setReport(errorReport({ message: msg, stack: typeof r === 'object' ? r?.stack : undefined, digest: typeof r === 'object' ? r?.digest : undefined, kind: '요청 처리 오류' }))
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  if (!report) return null
  return (
    <div role="alert" data-vv="pin" className="no-print fixed inset-x-3 bottom-[calc(var(--tabbar-space)+8px)] z-50 mx-auto flex max-w-md animate-pop items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-xl sm:bottom-4">
      <span className="min-w-0 flex-1">⚠️ 문제가 생겼어요. 계속되면 오류 내용을 담당자에게 보내 주세요.</span>
      <button
        type="button"
        className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 font-semibold"
        onClick={async () => {
          setCopied(await copyText(report))
          setTimeout(() => setCopied(false), 2500)
        }}
      >
        {copied ? '복사됨 ✓' : '오류 복사'}
      </button>
      <button type="button" aria-label="닫기" className="shrink-0 px-1 text-white/70" onClick={() => setReport(null)}>
        ✕
      </button>
    </div>
  )
}
