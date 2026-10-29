'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

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
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingText : children}
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
        setDone(true)
        setTimeout(() => setDone(false), 1800)
      }}
    >
      {done ? '복사됨 ✓' : label}
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

export function FormMessage({ state }: { state?: { error?: string; ok?: string } | null }) {
  if (!state?.error && !state?.ok) return null
  return (
    <p
      role="status"
      className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${
        state.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      {state.error ?? state.ok}
    </p>
  )
}
