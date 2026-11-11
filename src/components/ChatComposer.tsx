'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { FormState } from '@/app/actions/auth'
import { stickerToken } from '@/lib/stickers'
import { buttonToken, type ChatButton } from '@/lib/chatButtons'
import Icon from './Icon'
import StickerPicker, { StickerToggle } from './StickerPicker'
import { FormMessage, haptic, keepInputs } from './ui'

function SendButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="보내기"
      data-track="메시지 보내기"
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
 * Enter = 보내기 · Shift+Enter = 줄바꿈 (한글을 조합하는 중에 누른 Enter는 글자만 확정 — 두 번 보내지 않게)
 */
/** 쓰던 글을 넣어 두는 이름 (대화 주소를 뒤에 붙임) · 보관 시간 */
export const DRAFT_PREFIX = 'chat-draft:'
const DRAFT_TTL = 30 * 60_000

export default function ChatComposer({
  action,
  placeholder,
  quickReplies = [],
  context,
  extra,
  mentions,
  buttons,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  placeholder: string
  quickReplies?: string[]
  context?: React.ReactNode
  /** 입력칸 아래 추가 칸 (예: 공지로 고정) */
  extra?: React.ReactNode
  /** 단체방: '@이름'으로 부를 수 있는 사람 (나는 빼고) — '@'를 치거나 @ 버튼을 누르면 고르는 줄이 뜸 */
  mentions?: { id: string; name: string; admin?: boolean }[]
  /** 담당자 문의 답장: 보낼 수 있는 바로 가기 버튼 (예: 근무 시작하러 가기) */
  buttons?: ChatButton[]
}) {
  const [state, formAction] = useActionState(action, null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [picker, setPicker] = useState(false)
  // 이모티콘을 보낸 거면, 보낸 뒤에도 입력칸에 쓰던 글은 그대로 둠
  const stickerSent = useRef(false)
  // 이모티콘: 누르면 바로 보냄 (같은 폼의 다른 칸 — 공지 고정 등 — 은 그대로 함께)
  const sendSticker = (id: string) => {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    fd.set('body', stickerToken(id))
    stickerSent.current = true
    setPicker(false)
    startTransition(() => formAction(fd))
  }

  // ── 바로 가기 버튼: 고르면 바로 보냄 (입력칸에 쓴 글이 있으면 그 글과 함께, 비어 있으면 기본 안내 한 줄과 함께) ──
  const [btnPicker, setBtnPicker] = useState(false)
  const sendButton = (b: ChatButton) => {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    fd.set('body', `${textRef.current?.value.trim() || b.lead}\n${buttonToken(b.key)}`)
    setBtnPicker(false)
    haptic(8)
    startTransition(() => formAction(fd))
  }

  // ── 사람 부르기(@이름): 커서 바로 앞이 '@글자'면 그 글자로 사람을 거름 ──
  const [mq, setMq] = useState<string | null>(null)
  const detect = () => {
    const el = textRef.current
    if (!el || !mentions?.length) return
    const before = el.value.slice(0, el.selectionStart ?? el.value.length)
    const m = before.match(/(^|\s)@([^\s@]{0,12})$/)
    setMq(m ? m[2] : null)
  }
  const candidates = mq === null || !mentions ? [] : mentions.filter((p) => p.name.includes(mq)).slice(0, 12)
  const pickMention = (name: string) => {
    const el = textRef.current
    if (!el) return
    const pos = el.selectionStart ?? el.value.length
    const head = el.value.slice(0, pos).replace(/@([^\s@]{0,12})$/, `@${name} `)
    el.value = head + el.value.slice(pos).replace(/^ /, '')
    el.focus()
    el.setSelectionRange(head.length, head.length)
    setMq(null)
    haptic(8)
    fit()
  }
  const startMention = () => {
    const el = textRef.current
    if (!el) return
    const pos = el.selectionStart ?? el.value.length
    const head = el.value.slice(0, pos)
    const add = head && !/\s$/.test(head) ? ' @' : '@'
    el.value = head + add + el.value.slice(pos)
    el.focus()
    el.setSelectionRange(pos + add.length, pos + add.length)
    detect()
    fit()
  }

  // Shift를 누른 채 Enter인지 (휴대폰 자판은 keydown 없이 '줄바꿈 넣기'만 오기도 해서 따로 기억)
  const shiftHeld = useRef(false)
  const send = () => {
    const form = formRef.current
    const el = textRef.current
    if (!form || !el || !el.value.trim()) return
    // 보내는 중이면 또 보내지 않음
    if (form.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled) return
    form.requestSubmit()
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    shiftHeld.current = e.shiftKey
    if (e.key === 'Escape' && mq !== null) {
      e.preventDefault()
      setMq(null)
      return
    }
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    // 부를 사람을 고르는 중이면 Enter는 첫 번째 사람 넣기
    if (candidates.length) pickMention(candidates[0].name)
    else send()
  }
  const onBeforeInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const ne = e.nativeEvent as InputEvent
    if ((ne.inputType === 'insertLineBreak' || ne.inputType === 'insertParagraph') && !shiftHeld.current && !ne.isComposing) {
      e.preventDefault()
      if (candidates.length) pickMention(candidates[0].name)
      else send()
    }
  }

  // 단체방(이모티콘 + @ 버튼 두 개): 글을 쓰기 시작하면 두 버튼을 '›' 하나로 접어 입력 칸을 넓힘 (360px에서 한 줄에 10자 → 14자쯤)
  // '›'를 누르면 다시 펼침 · 글을 다 지우거나 보내면 처음대로
  const [hasText, setHasText] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const compact = !!mentions?.length && hasText && !toolsOpen && !picker
  const fit = () => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
    const filled = el.value.trim().length > 0
    setHasText(filled)
    if (!filled) setToolsOpen(false)
  }
  // 쓰던 글: 보내기 전에 다른 화면에 다녀오거나 화면이 새로 열려도(휴대폰이 탭을 닫았다 다시 열 때) 남게
  // — 이 탭 안에서만 · 대화마다 따로 · 30분 지나면 버림 · 보내면 지움 (로그아웃할 때도 지움: LogoutButton)
  const draftKey = useRef('')
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    const key = `${DRAFT_PREFIX}${location.pathname}${location.search}`
    draftKey.current = key
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { t: number; v: string } | null
      if (saved && typeof saved.v === 'string' && Date.now() - saved.t < DRAFT_TTL && !el.value) {
        el.value = saved.v.slice(0, 2000)
        el.dispatchEvent(new Event('input', { bubbles: true })) // 높이·보내기 버튼 상태를 맞춤
      } else if (saved) sessionStorage.removeItem(key)
    } catch {}
    const save = () => {
      try {
        if (el.value.trim()) sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: el.value }))
        else sessionStorage.removeItem(key)
      } catch {}
    }
    el.addEventListener('input', save)
    return () => el.removeEventListener('input', save)
  }, [])

  // 버튼이 접히거나 펼쳐지면 입력 칸 너비가 달라지니 높이를 다시 맞춤
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [compact])

  useEffect(() => {
    if (!state) return
    const wasSticker = stickerSent.current
    stickerSent.current = false
    if (!state.ok || !textRef.current) return
    if (wasSticker) {
      haptic(10)
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
      return
    }
    textRef.current.value = ''
    // 보냈으니 쓰던 글은 지움 (이모티콘만 보낸 경우에는 쓰던 글이 입력칸에 남아 있으니 그대로 둠)
    try {
      sessionStorage.removeItem(draftKey.current)
    } catch {}
    setMq(null)
    // 보낸 뒤에는 '공지로 고정' 같은 체크도 풀어 둠 (다음 글이 실수로 고정되지 않게)
    formRef.current?.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((c) => (c.checked = false))
    fit()
    haptic(10)
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  }, [state])

  return (
    <form ref={formRef} action={formAction} onReset={keepInputs} className="space-y-2">
      {(quickReplies.length > 0 || !!buttons?.length) && (
        <div className="fade-x flex gap-1.5 overflow-x-auto pb-0.5" data-quick-replies>
          {!!buttons?.length && (
            <button
              type="button"
              aria-expanded={btnPicker}
              data-button-toggle
              onClick={() => {
                setBtnPicker((v) => !v)
                setPicker(false)
              }}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold ring-1 transition active:scale-95 ${btnPicker ? 'bg-brand-600 text-white ring-brand-600' : 'bg-brand-50 text-brand-700 ring-brand-100'}`}
            >
              <Icon name="sparkle" /> 버튼 보내기
            </button>
          )}
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
      {btnPicker && !!buttons?.length && (
        // 바로 가기 버튼 고르기 (누르면 바로 보냄)
        <div className="animate-pop rounded-2xl bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-line" data-button-picker>
          <p className="text-sm font-bold">어떤 버튼을 보낼까요?</p>
          <p className="mb-2.5 text-xs text-mute">누르면 바로 보내요 · 입력칸에 쓴 글이 있으면 그 글과 함께</p>
          <div className="grid grid-cols-2 gap-1.5">
            {buttons.map((b) => (
              <button
                key={b.key}
                type="button"
                data-button-option={b.key}
                onClick={() => sendButton(b)}
                className="flex min-w-0 items-center gap-1.5 rounded-xl bg-bg px-2.5 py-2.5 text-left text-[13px] font-semibold text-ink transition active:scale-95"
              >
                <Icon name={b.icon} className="shrink-0 text-brand-600" />
                <span className="min-w-0 truncate">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {picker && (
        <StickerPicker
          onPick={sendSticker}
          onClose={() => {
            setPicker(false)
            formRef.current?.querySelector<HTMLButtonElement>('[data-sticker-toggle]')?.focus()
          }}
        />
      )}
      {/* '@'를 치면: 부를 사람 고르기 (이름으로 거름) */}
      {candidates.length > 0 && (
        <div className="animate-pop rounded-2xl bg-white p-2 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-line" data-mention-list>
          <p className="px-1 pb-1.5 text-xs font-semibold text-mute">누구를 부를까요?</p>
          <div className="fade-x flex gap-1.5 overflow-x-auto">
            {candidates.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(p.name)}
                className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-[13px] font-semibold text-brand-700 ring-1 ring-brand-100 transition active:scale-95"
              >
                @{p.name}
                {p.admin && <span className="rounded bg-white px-1 text-[10px] font-bold text-brand-700">담당자</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-end gap-1.5 rounded-3xl bg-white p-1.5 pl-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-line">
        {compact ? (
          <button
            type="button"
            aria-label="이모티콘·사람 부르기 펼치기"
            data-tools-toggle
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setToolsOpen(true)}
            className="grid h-11 w-7 shrink-0 animate-pop place-items-center rounded-full text-2xl leading-none font-bold text-mute transition active:scale-90 active:bg-bg"
          >
            <span aria-hidden className="-mt-0.5">›</span>
          </button>
        ) : (
          <>
            <StickerToggle
              open={picker}
              className={toolsOpen ? 'animate-pop' : ''}
              onClick={() => {
                setPicker((v) => !v)
                setBtnPicker(false)
              }}
            />
            {!!mentions?.length && (
              <button
                type="button"
                aria-label="사람 부르기 (@)"
                data-mention-toggle
                onMouseDown={(e) => e.preventDefault()}
                onClick={startMention}
                className={`grid size-11 shrink-0 place-items-center rounded-full text-[19px] font-bold text-sub transition active:scale-90 active:bg-bg ${toolsOpen ? 'animate-pop' : ''}`}
              >
                @
              </button>
            )}
          </>
        )}
        <textarea
          ref={textRef}
          name="body"
          rows={1}
          maxLength={2000}
          required
          placeholder={placeholder}
          enterKeyHint="send"
          aria-keyshortcuts="Enter"
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            shiftHeld.current = e.shiftKey
            if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') detect()
          }}
          onClick={detect}
          onBeforeInput={onBeforeInput}
          onInput={() => {
            fit()
            detect()
          }}
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
