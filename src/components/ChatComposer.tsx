'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { FormState } from '@/app/actions/auth'
import { STICKERS, stickerToken, type StickerId } from '@/lib/stickers'
import Sticker from './Sticker'
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
  extra,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  placeholder: string
  quickReplies?: string[]
  context?: React.ReactNode
  /** 입력칸 아래 추가 칸 (예: 공지로 고정) */
  extra?: React.ReactNode
}) {
  const [state, formAction] = useActionState(action, null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [picker, setPicker] = useState(false)
  // 이모티콘: 누르면 바로 보냄
  const sendSticker = (id: StickerId) => {
    const el = textRef.current!
    el.value = stickerToken(id)
    setPicker(false)
    haptic(12)
    formRef.current?.requestSubmit()
  }

  const fit = () => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }

  useEffect(() => {
    if (!state?.ok || !textRef.current) return
    textRef.current.value = ''
    // 보낸 뒤에는 '공지로 고정' 같은 체크도 풀어 둠 (다음 글이 실수로 고정되지 않게)
    formRef.current?.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((c) => (c.checked = false))
    fit()
    haptic(10)
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  }, [state])

  return (
    <form ref={formRef} action={formAction} onReset={keepInputs} className="space-y-2">
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
      {picker && (
        <div role="dialog" aria-label="이모티콘" className="animate-pop rounded-3xl bg-white p-2 shadow-[0_4px_20px_rgba(0,0,0,0.1)] ring-1 ring-line">
          <div className="grid max-h-64 grid-cols-4 gap-1 overflow-y-auto">
            {STICKERS.map((st) => (
              <button
                key={st.id}
                type="button"
                aria-label={st.label}
                onClick={() => sendSticker(st.id)}
                className="grid place-items-center rounded-2xl p-1 transition hover:bg-bg active:scale-90"
              >
                <Sticker id={st.id} size={72} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-end gap-1.5 rounded-3xl bg-white p-1.5 pl-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-line">
        <button
          type="button"
          aria-label="이모티콘"
          aria-expanded={picker}
          onClick={() => setPicker((v) => !v)}
          className={`grid size-11 shrink-0 place-items-center rounded-full transition active:scale-90 ${picker ? 'bg-brand-50' : ''}`}
        >
          <Sticker id="hi" size={34} caption={false} />
        </button>
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
      {extra}
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
