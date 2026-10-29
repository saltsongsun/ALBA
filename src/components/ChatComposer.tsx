'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import type { FormState } from '@/app/actions/auth'
import { FormMessage, haptic, keepInputs } from './ui'

function SendButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="보내기"
      className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-600/30 transition active:scale-90 disabled:opacity-60"
    >
      {pending ? (
        <span aria-hidden className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        <svg viewBox="0 0 24 24" className="size-5 -translate-x-px translate-y-px" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      )}
    </button>
  )
}

/**
 * 문의 입력칸. 쓰는 만큼 늘어나고(최대 5줄), 보내기에 성공하면 비워지고 맨 아래로 내려감.
 * 오류가 나면 쓴 내용은 그대로 둠.
 */
export default function ChatComposer({
  action,
  placeholder,
  quickReplies = [],
  context,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  placeholder: string
  quickReplies?: string[]
  context?: React.ReactNode
}) {
  const [state, formAction] = useActionState(action, null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const fit = () => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }

  useEffect(() => {
    if (!state?.ok || !textRef.current) return
    textRef.current.value = ''
    fit()
    haptic(10)
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  }, [state])

  return (
    <form action={formAction} onReset={keepInputs} className="space-y-2">
      {quickReplies.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-sub ring-1 ring-line transition active:scale-95"
              onClick={() => {
                const el = textRef.current!
                el.value = el.value ? `${el.value} ${q}` : q
                fit()
                el.focus()
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}
      {context}
      {state?.error && <FormMessage state={state} />}
      <div className="flex items-end gap-2 rounded-3xl bg-white p-1.5 pl-4 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-line">
        <textarea
          ref={textRef}
          name="body"
          rows={1}
          maxLength={2000}
          required
          placeholder={placeholder}
          onInput={fit}
          className="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-ink outline-none placeholder:text-mute"
        />
        <SendButton />
      </div>
    </form>
  )
}

/** 새 메시지가 오면 맨 아래로 (처음 열 때도) */
export function ScrollToEnd({ count }: { count: number }) {
  useEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight })
  }, [count])
  return null
}
