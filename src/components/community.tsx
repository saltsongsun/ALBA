'use client'

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { addComment, createPost, report, saveReview, setNickname, toggleLike, updatePost } from '@/app/actions/community'
import { sendable, splitPostBody, stickerToken } from '@/lib/stickers'
import Icon from './Icon'
import Sticker from './Sticker'
import StickerPicker, { StickerToggle } from './StickerPicker'
import { FormMessage, haptic, keepInputs, SubmitButton } from './ui'

/** 봇 함정 칸: 사람에게는 안 보이고, 자동 입력 봇만 채움 */
function Honeypot() {
  return (
    <div aria-hidden className="sr-only">
      <label>
        웹사이트
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  )
}

const CATS = [
  { id: 'free', label: '자유', icon: 'chat' },
  { id: 'tip', label: '꿀팁', icon: 'bulb' },
  { id: 'question', label: '질문', icon: 'help' },
] as const

/** 글쓰기 */
const DRAFT_KEY = 'community-draft'

export function PostForm({ defaultCategory, defaultTitle, post }: { defaultCategory: string; defaultTitle?: string; post?: { id: string; title: string; body: string } }) {
  const [state, action] = useActionState(post ? updatePost.bind(null, post.id) : createPost, null)
  // 고칠 때: 저장된 내용에서 맨 끝 이모티콘 줄을 떼어 '넣은 이모티콘'으로
  const initial = splitPostBody(post?.body ?? '')
  const [body, setBody] = useState(initial.text)
  const [sticker, setSticker] = useState<string | null>(initial.sticker?.id ?? null)
  const [picker, setPicker] = useState(false)
  const [restored, setRestored] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  // 새 글: 쓰던 글을 이 휴대폰에 잠시 저장 (앱이 꺼지거나 화면을 나가도 다시 불러옴)
  useEffect(() => {
    if (post) return
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as { title?: string; body?: string; category?: string; sticker?: string } | null
      const f = formRef.current
      if (!d || !f || (!d.title && !d.body)) return
      ;(f.elements.namedItem('title') as HTMLInputElement).value = d.title ?? ''
      setBody(d.body ?? '')
      if (d.sticker && sendable(d.sticker)) setSticker(d.sticker)
      const cat = f.querySelector<HTMLInputElement>(`input[name=category][value="${d.category}"]`)
      if (cat) cat.checked = true
      setRestored(true)
    } catch {}
  }, [post])
  const save = () => {
    if (post) return
    const f = formRef.current
    if (!f) return
    const fd = new FormData(f)
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: fd.get('title'), body: fd.get('body'), category: fd.get('category'), sticker: fd.get('sticker') || undefined }))
    } catch {}
  }
  return (
    <form
      ref={formRef}
      action={action}
      onReset={keepInputs}
      onInput={save}
      onChange={save}
      // 올리면 임시 저장은 지움 (실패하면 화면에 그대로 남아 있음)
      onSubmit={() => {
        if (!post) setTimeout(() => { try { localStorage.removeItem(DRAFT_KEY) } catch {} }, 0)
      }}
      className="space-y-4"
      data-post-form
    >
      {restored && (
        <p className="flex animate-slide-down items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" data-draft-restored>
          <span>✍️ 쓰던 글을 불러왔어요</span>
          <button
            type="button"
            className="shrink-0 font-semibold text-amber-700 underline-offset-2 hover:underline"
            onClick={() => {
              try { localStorage.removeItem(DRAFT_KEY) } catch {}
              ;(formRef.current?.elements.namedItem('title') as HTMLInputElement).value = ''
              setBody('')
              setSticker(null)
              setRestored(false)
            }}
          >
            지우고 새로 쓰기
          </button>
        </p>
      )}
      <Honeypot />
      <fieldset>
        <legend className="label">말머리</legend>
        <div className="flex gap-2">
          {CATS.map((c) => (
            <label key={c.id} className="flex-1">
              <input type="radio" name="category" value={c.id} defaultChecked={c.id === defaultCategory} className="peer sr-only" />
              <span className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-bold text-sub ring-1 ring-line transition peer-checked:bg-brand-600 peer-checked:text-white peer-checked:ring-brand-600 active:scale-95">
                <Icon name={c.icon} /> {c.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="post-title">
          제목
        </label>
        <input id="post-title" name="title" className="input" maxLength={60} required defaultValue={post?.title ?? defaultTitle} placeholder="예: 행사장 주차는 어디가 좋아요?" />
      </div>
      <div>
        <label className="label" htmlFor="post-body">
          내용
        </label>
        <textarea id="post-body" name="body" className="input min-h-40" maxLength={3000} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="서로 돕는 공간이에요. 남을 깎아내리거나 개인정보(전화번호 등)를 올리지 말아 주세요." />
        <p className="mt-1 text-right text-xs text-mute tabular-nums">{body.length}/3000</p>
      </div>
      {/* 이모티콘 하나 붙이기 (글 맨 아래에 크게 보임) */}
      <div className="space-y-2" data-post-sticker>
        <input type="hidden" name="sticker" value={sticker ?? ''} />
        {sticker ? (
          <div className="flex items-center gap-3 rounded-2xl bg-bg p-2 pr-3">
            <Sticker id={sticker} size={72} />
            <p className="min-w-0 flex-1 text-sm font-semibold text-sub">글 맨 아래에 붙어요</p>
            <button type="button" className="chip h-9 shrink-0 px-3 text-xs" onClick={() => setPicker(true)}>
              바꾸기
            </button>
            <button
              type="button"
              className="chip h-9 shrink-0 px-3 text-xs"
              onClick={() => {
                setSticker(null)
                setPicker(false)
                setTimeout(save, 0)
              }}
            >
              빼기
            </button>
          </div>
        ) : (
          !picker && (
            <button type="button" className="chip h-10 gap-1.5 px-3.5 text-sm" onClick={() => setPicker(true)} data-sticker-toggle>
              <span aria-hidden className="text-[18px]">
                <Icon name="smile" />
              </span>
              이모티콘 넣기
            </button>
          )
        )}
        {picker && (
          <StickerPicker
            title="글에 넣을 이모티콘"
            onPick={(id) => {
              setSticker(id)
              setPicker(false)
              setTimeout(save, 0)
            }}
            onClose={() => setPicker(false)}
          />
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3.5 text-base" pendingText={post ? '고치는 중…' : '올리는 중…'}>
        {post ? '고친 내용 저장' : '올리기'}
      </SubmitButton>
    </form>
  )
}

/** 좋아요: 누르면 바로 하트가 톡 튀고 숫자가 바뀜 (서버 결과로 맞춤) */
export function LikeButton({ postId, liked, likes, disabled }: { postId: string; liked: boolean; likes: number; disabled?: boolean }) {
  const [s, setS] = useState({ liked, likes })
  const [pop, setPop] = useState(0)
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={disabled || pending}
      aria-pressed={s.liked}
      data-like
      onClick={() => {
        const next = { liked: !s.liked, likes: s.likes + (s.liked ? -1 : 1) }
        setS(next)
        if (next.liked) {
          setPop((n) => n + 1)
          haptic(10)
        }
        start(async () => {
          const r = await toggleLike(postId)
          if ('liked' in r) setS(r)
          else setS({ liked, likes })
        })
      }}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold ring-1 transition active:scale-95 disabled:opacity-60 ${
        s.liked ? 'bg-rose-50 text-rose-600 ring-rose-200' : 'bg-white text-sub ring-line'
      }`}
    >
      <span key={pop} className={pop ? 'inline-block animate-pop' : 'inline-block'} aria-hidden>
        {s.liked ? '❤️' : '🤍'}
      </span>
      좋아요 <span className="tabular-nums">{s.likes}</span>
    </button>
  )
}

/** 댓글 쓰기 */
export function CommentForm({ postId }: { postId: string }) {
  const [state, action, sending] = useActionState(addComment.bind(null, postId), null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [picker, setPicker] = useState(false)
  // 이모티콘 댓글: 누르면 바로 달림 (쓰던 댓글은 칸에 그대로)
  const stickerSent = useRef(false)
  const sendSticker = (id: string) => {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    fd.set('body', stickerToken(id))
    stickerSent.current = true
    setPicker(false)
    startTransition(() => action(fd))
  }
  useEffect(() => {
    if (!state) return
    const wasSticker = stickerSent.current
    stickerSent.current = false
    if (state.ok && ref.current) {
      if (!wasSticker) {
        ref.current.value = ''
        ref.current.style.height = ''
      }
      // 방금 단 댓글로 이동해 잠깐 반짝 (목록이 새로 그려진 뒤)
      setTimeout(() => {
        const mine = document.querySelectorAll<HTMLElement>('[data-comment][data-mine]')
        const el = mine[mine.length - 1]
        if (!el) return
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
        el.dataset.justAdded = '1'
        el.classList.add('ring-2', 'ring-brand-300', 'animate-pop')
        setTimeout(() => el.classList.remove('ring-2', 'ring-brand-300'), 1600)
      }, 350)
    }
  }, [state])
  // 댓글의 '↩ 답글'을 누르면 '@별명 '을 넣고 댓글 칸으로
  useEffect(() => {
    const onReply = (e: Event) => {
      const nick = (e as CustomEvent<string>).detail
      const el = ref.current
      if (!el || !nick) return
      const tag = `@${nick} `
      if (!el.value.startsWith(tag)) el.value = tag + el.value.replace(/^@\S+\s/, '')
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
      el.classList.remove('animate-pop')
      void el.offsetWidth
      el.classList.add('animate-pop')
    }
    window.addEventListener('community-reply', onReply)
    return () => window.removeEventListener('community-reply', onReply)
  }, [])
  return (
    <form ref={formRef} action={action} onReset={keepInputs} className="space-y-2" data-comment-form>
      <Honeypot />
      <textarea
        ref={ref}
        name="body"
        rows={2}
        maxLength={500}
        required
        className="input max-h-40 resize-none overflow-y-auto transition-[height] duration-150"
        placeholder="따뜻한 댓글을 남겨 주세요"
        // 쓰는 만큼 칸이 늘어남 (6줄 정도까지)
        onInput={(e) => {
          const el = e.currentTarget
          el.style.height = 'auto'
          el.style.height = `${Math.min(el.scrollHeight + 2, 160)}px`
        }}
      />
      {state?.error && <FormMessage state={state} />}
      {picker && (
        <StickerPicker
          title="댓글로 보낼 이모티콘"
          onPick={sendSticker}
          onClose={() => {
            setPicker(false)
            formRef.current?.querySelector<HTMLButtonElement>('[data-sticker-toggle]')?.focus()
          }}
        />
      )}
      <div className="flex items-center gap-2">
        <StickerToggle open={picker} onClick={() => setPicker((v) => !v)} className="ring-1 ring-line" />
        <SubmitButton className="btn-primary btn-sm flex-1" pendingText="다는 중…">
          {sending ? '다는 중…' : '댓글 달기'}
        </SubmitButton>
      </div>
    </form>
  )
}

/** 신고 (사유 고르기) */
export function ReportButton({ target, id, label = '신고' }: { target: 'post' | 'comment' | 'review'; id: string; label?: string }) {
  const [state, action] = useActionState(report.bind(null, target, id), null)
  return (
    // 줄 안에서 눌러도 옆 글자를 밀지 않게, 사유 고르기는 버튼 아래 작은 창으로 뜸
    <details className="relative shrink-0 text-xs" data-report={target}>
      <summary className="cursor-pointer list-none font-semibold whitespace-nowrap text-mute before:hidden hover:text-rose-600">🚩 {label}</summary>
      {state?.ok ? (
        <p className="absolute right-0 z-10 mt-2 w-56 animate-pop rounded-xl bg-white p-3 font-semibold text-emerald-700 shadow-lg ring-1 ring-line">{state.ok}</p>
      ) : (
        <form action={action} className="absolute right-0 z-10 mt-2 w-56 animate-pop space-y-2 rounded-xl bg-white p-3 shadow-lg ring-1 ring-line">
          <select name="reason" className="input py-2 text-sm" defaultValue="욕설·비하">
            {['욕설·비하', '광고·도배', '개인정보 노출', '거짓 정보', '그 밖에 부적절'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <SubmitButton className="btn-gray btn-sm w-full" pendingText="보내는 중…">
            신고하기
          </SubmitButton>
          <FormMessage state={state} />
        </form>
      )}
    </details>
  )
}

/** 별명 바꾸기 */
/** 별명 규칙 (서버와 같음): 바로바로 알려 줌 */
function nickHint(v: string): { ok: boolean; text: string } | null {
  if (!v) return null
  if (!/^[가-힣a-zA-Z0-9]*$/.test(v)) return { ok: false, text: '한글·영문·숫자만 쓸 수 있어요 (띄어쓰기·기호 안 됨)' }
  if (v.length < 2) return { ok: false, text: '2자 이상 써 주세요' }
  if (/운영|관리자|해피워크|어드민|admin|staff|공식/i.test(v)) return { ok: false, text: '운영자로 오해할 수 있는 별명은 안 돼요' }
  return { ok: true, text: '쓸 수 있는 모양이에요' }
}

export function NicknameForm({ current }: { current: string }) {
  const [state, action] = useActionState(setNickname, null)
  const [val, setVal] = useState(current)
  const hint = val !== current ? nickHint(val) : null
  return (
    <form action={action} className="space-y-2" data-nickname-form>
      <div className="flex gap-2">
        {/* 아직 별명이 없으면 빈 칸에 예시 · 버튼도 '정하기' (없는데 '바꾸기'라 헷갈리던 것) */}
        <input
          name="nickname"
          value={val}
          onChange={(e) => setVal(e.target.value.trim())}
          maxLength={12}
          required
          className="input min-w-0 flex-1"
          aria-label="별명"
          placeholder="예: 주차왕 (2~12자)"
        />
        <SubmitButton className="btn-primary btn-sm shrink-0" pendingText={current ? '바꾸는 중…' : '정하는 중…'}>
          {current ? '바꾸기' : '정하기'}
        </SubmitButton>
      </div>
      {hint && (
        <p className={`text-xs font-semibold ${hint.ok ? 'text-emerald-600' : 'text-rose-600'}`} aria-live="polite" data-nick-hint>
          {hint.ok ? '✓ ' : '✕ '}
          {hint.text}
        </p>
      )}
      <FormMessage state={state} />
    </form>
  )
}

const RATING_WORDS: Record<number, string> = { 1: '😞 별로였어요', 2: '😕 아쉬웠어요', 3: '🙂 보통이었어요', 4: '😊 좋았어요', 5: '🤩 최고였어요!' }

/** 후기: 별 다섯 개를 눌러 고르고 한 줄 이상 */
export function ReviewForm({ jobId, rating: r0, body: b0 }: { jobId: string; rating?: number; body?: string }) {
  const [state, action] = useActionState(saveReview.bind(null, jobId), null)
  const [rating, setRating] = useState(r0 ?? 0)
  return (
    <form action={action} onReset={keepInputs} className="space-y-4" data-review-form>
      <div>
        <p className="label">별점</p>
        <div className="flex gap-1" role="radiogroup" aria-label="별점">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}점`}
              onClick={() => {
                setRating(n)
                haptic(8)
              }}
              className={`text-4xl transition active:scale-90 ${n <= rating ? 'animate-pop' : 'opacity-30 grayscale'}`}
            >
              ⭐
            </button>
          ))}
        </div>
        <input type="hidden" name="rating" value={rating || ''} />
        {/* 별을 누를 때마다 한마디가 바뀜 */}
        <p key={rating} className={`mt-1 text-sm font-semibold ${rating ? 'animate-pop text-amber-600' : 'text-mute'}`} aria-live="polite" data-rating-label>
          {RATING_WORDS[rating] ?? '별을 눌러 골라 주세요'}
        </p>
      </div>
      <div>
        <label className="label" htmlFor="review-body">
          후기
        </label>
        <textarea id="review-body" name="body" defaultValue={b0} className="input min-h-28" maxLength={500} required placeholder="일하기 어땠나요? 담당자 응대·휴게·급여 지급 등 다음 근무자에게 도움이 되는 이야기를 남겨 주세요." />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3" pendingText="남기는 중…">
        {b0 ? '후기 고치기' : '후기 남기기'}
      </SubmitButton>
    </form>
  )
}

/** 글 내용을 두 번 톡 누르면 좋아요 (이미 눌렀으면 하트만), 누른 자리에서 하트가 떠오름 */
export function DoubleTapLike({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([])
  const last = useRef(0)
  return (
    <div
      className="relative touch-manipulation"
      data-double-tap
      onPointerUp={(e) => {
        if (!enabled || e.pointerType === 'mouse' && e.button !== 0) return
        const now = Date.now()
        if (now - last.current > 320) {
          last.current = now
          return
        }
        last.current = 0
        const r = e.currentTarget.getBoundingClientRect()
        const like = document.querySelector<HTMLButtonElement>('[data-like]')
        if (like && !like.disabled && like.getAttribute('aria-pressed') !== 'true') like.click()
        else haptic(10)
        const id = now
        setHearts((h) => [...h, { id, x: e.clientX - r.left, y: e.clientY - r.top }])
        setTimeout(() => setHearts((h) => h.filter((v) => v.id !== id)), 850)
      }}
    >
      {children}
      {hearts.map((h) => (
        <span key={h.id} aria-hidden data-heart className="pointer-events-none absolute animate-heart text-5xl drop-shadow" style={{ left: h.x, top: h.y }}>
          ❤️
        </span>
      ))}
    </div>
  )
}

/** 댓글에 답글: 아래 댓글 칸에 '@별명 '을 넣어 줌 */
export function ReplyButton({ nick }: { nick: string }) {
  return (
    <button
      type="button"
      data-reply
      onClick={() => {
        haptic(8)
        window.dispatchEvent(new CustomEvent('community-reply', { detail: nick }))
      }}
      className="text-xs font-semibold text-mute transition hover:text-brand-600 active:scale-95"
    >
      ↩ 답글
    </button>
  )
}
