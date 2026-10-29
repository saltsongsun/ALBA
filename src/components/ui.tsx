'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

/** 안드로이드 휴대폰을 짧게 진동 (아이폰·컴퓨터는 지원하지 않아 무시됨) */
export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {}
}

function Spinner() {
  return <span aria-hidden className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" />
}

export function SubmitButton({
  children,
  className = 'btn-primary',
  pendingText = '처리 중…',
  name,
  value,
}: {
  children: React.ReactNode
  className?: string
  pendingText?: string
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} name={name} value={value}>
      {pending ? (
        <>
          <Spinner />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  )
}

/** 대화상자 없이 두 번 눌러 확인하는 제출 버튼 (휴대폰 인앱 브라우저에서도 동작) */
export function ConfirmSubmit({
  children,
  confirmText = '한 번 더 누르면 진행돼요',
  className = 'btn-danger',
  name,
  value,
}: {
  children: React.ReactNode
  confirmText?: string
  className?: string
  name?: string
  value?: string
}) {
  const [armed, setArmed] = useState(false)
  const { pending } = useFormStatus()
  return (
    <button
      type={armed ? 'submit' : 'button'}
      className={className}
      disabled={pending}
      name={name}
      value={value}
      onClick={() => {
        if (!armed) {
          haptic(10)
          setArmed(true)
          setTimeout(() => setArmed(false), 4000)
        }
      }}
    >
      {pending ? '처리 중…' : armed ? confirmText : children}
    </button>
  )
}

export function PrintButton({ label = '인쇄 / PDF 저장' }: { label?: string }) {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      {label}
    </button>
  )
}

export function CopyButton({
  text,
  label = '복사',
  className = 'btn-gray btn-sm',
}: {
  text: string
  label?: string
  className?: string
}) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          const ta = document.createElement('textarea')
          ta.value = text
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          ta.remove()
        }
        haptic(12)
        setDone(true)
        setTimeout(() => setDone(false), 1800)
      }}
    >
      {done ? <span className="animate-pop">복사됨 ✓</span> : label}
    </button>
  )
}

/** 휴대폰에서는 공유 시트(카카오톡 등)를 열고, PC에서는 링크를 복사 */
export function ShareButton({ title, text, path }: { title: string; text?: string; path: string }) {
  const [msg, setMsg] = useState('')
  return (
    <button
      type="button"
      className="btn-soft"
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString()
        if (navigator.share) {
          try {
            await navigator.share({ title, text, url })
            return
          } catch {
            /* 취소 */
            return
          }
        }
        await navigator.clipboard.writeText(text ? `${text}\n${url}` : url)
        setMsg('링크 복사됨 ✓')
        setTimeout(() => setMsg(''), 1800)
      }}
    >
      {msg || '공유하기'}
    </button>
  )
}

/**
 * React 19는 서버 액션이 끝나면 폼 입력칸을 비우는데, 오류를 돌려준 경우에도 비워서 처음부터 다시 입력해야 합니다.
 * useActionState 폼에 onReset={keepInputs}를 달아 입력값을 그대로 둡니다.
 */
export function keepInputs(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
}

/** 처리 결과 안내. 성공이면 체크가 그려지고, 오류면 흔들림 (같은 오류가 반복돼도 다시 흔들림) */
export function FormMessage({ state }: { state?: { error?: string; ok?: string } | null }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !state) return
    const cls = state.error ? 'animate-shake' : 'animate-pop'
    el.classList.remove(cls)
    void el.offsetWidth // 애니메이션 다시 시작
    el.classList.add(cls)
    haptic(state.error ? [18, 60, 18] : 15)
  }, [state])
  if (!state?.error && !state?.ok) return null
  return (
    <p
      ref={ref}
      role="status"
      className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
        state.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      {state.error ? (
        <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 7.5v5.5M12 16.5v.01" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="check-draw" />
        </svg>
      )}
      <span>{state.error ?? state.ok}</span>
    </p>
  )
}
