'use client'

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react'

/**
 * 자동으로 다시 시도한 횟수. 오류 화면이 다시 그려져도 기억함 (같은 주소에서 1분 안에 두 번까지만 — 끝없이 되풀이하지 않게)
 */
const memo = { key: '', n: 0, at: 0 }
/** 자동으로 다시 시도하기까지 기다리는 시간(초): 첫 번째 · 두 번째 */
const DELAYS = [3, 8]

/**
 * 오류 화면의 '다시 시도'.
 * · 서버에서 화면을 다시 받아 옴 (서버·DB 연결이 잠깐 끊겼다 돌아왔을 때 실제로 되살아나게)
 * · 잠깐의 끊김은 사람이 누르지 않아도 풀리게: 3초 · 8초 뒤 자동으로 한 번씩 (남은 시간을 보여 줌)
 * · 인터넷이 끊긴 경우엔 연결이 돌아오는 순간 바로
 */
export default function ErrorRetry({ error, retry, children }: { error: unknown; retry: () => void; children?: ReactNode }) {
  // 지금 다시 여는 중인 오류 (다시 실패해 새 오류가 오면 저절로 풀림)
  const [busyFor, setBusyFor] = useState<unknown>(null)
  const busy = busyFor === error
  const [, startTransition] = useTransition()
  const [auto, setAuto] = useState<{ left: number; total: number } | 'offline' | null>(null)

  const go = useCallback(
    (byTimer: boolean) => {
      if (byTimer) {
        memo.n += 1
        memo.at = Date.now()
      }
      setBusyFor(error)
      setAuto(null)
      startTransition(() => retry())
    },
    [error, retry],
  )

  useEffect(() => {
    const path = location.pathname
    if (memo.key !== path || Date.now() - memo.at > 60_000) {
      memo.key = path
      memo.n = 0
      memo.at = Date.now()
    }
    let timer: ReturnType<typeof setInterval> | undefined
    const plan = () => {
      clearInterval(timer)
      if (!navigator.onLine) return setAuto('offline')
      const total = DELAYS[memo.n]
      if (!total) return setAuto(null)
      let left = total
      setAuto({ left, total })
      timer = setInterval(() => {
        left -= 1
        if (left > 0) return setAuto({ left, total })
        clearInterval(timer)
        go(true)
      }, 1000)
    }
    const first = setTimeout(plan, 0)
    const onOnline = () => {
      clearInterval(timer)
      go(false)
    }
    // 오류 화면에서 다른 것을 누르기 시작하면(오류 내용 복사·펼쳐 보기 등) 자동 시도를 멈춤 — 보던 것이 갑자기 바뀌지 않게
    const onTouch = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[data-retry]')) return
      clearInterval(timer)
      memo.n = DELAYS.length
      setAuto((a) => (a === 'offline' ? a : null))
    }
    const onOffline = () => {
      clearInterval(timer)
      setAuto('offline')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('pointerdown', onTouch)
    document.addEventListener('keydown', onTouch)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('pointerdown', onTouch)
      document.removeEventListener('keydown', onTouch)
    }
  }, [error, go])

  // 다시 여는 중인데 아무 답이 없으면 버튼을 다시 누를 수 있게
  useEffect(() => {
    if (busyFor == null) return
    const t = setTimeout(() => setBusyFor(null), 12_000)
    return () => clearTimeout(t)
  }, [busyFor])

  return (
    <div className="w-full">
      <div className="flex w-full gap-2">
        <button type="button" onClick={() => go(false)} disabled={busy} aria-busy={busy} className="btn-primary flex-1" data-retry>
          {busy ? '다시 여는 중…' : '다시 시도'}
        </button>
        {children}
      </div>
      {auto && !busy && (
        <div className="mt-3 text-xs text-mute" aria-live="polite" data-auto-retry={auto === 'offline' ? 'offline' : auto.left}>
          {auto === 'offline' ? (
            '인터넷이 연결되면 자동으로 다시 열어요'
          ) : (
            <>
              <b className="font-semibold text-sub tabular-nums">{auto.left}초</b> 뒤 자동으로 다시 시도해요
              {/* 남은 시간만큼 차오르는 줄 */}
              <span aria-hidden className="mx-auto mt-2 block h-1 w-24 overflow-hidden rounded-full bg-line">
                <span className="block h-full origin-left rounded-full bg-brand-500" style={{ animation: `grow ${auto.total}s linear both` }} />
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
