'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import type { FormState } from '@/app/actions/auth'
import Icon from './Icon'
import { haptic } from './ui'

const MENU_W = 176
const MENU_W_WIDE = 208
const ITEM_H = 46

/** 아래 입력칸(휴대폰은 탭 위에 붙어 있음)에 가리지 않게: 입력칸 위쪽까지만 씀 */
const floorY = () => Math.min(window.innerHeight, document.querySelector('[data-vv="end"]')?.getBoundingClientRect().top ?? window.innerHeight) - 8

/**
 * 말풍선을 꾹 누르면(PC는 오른쪽 클릭·키보드 Enter) 작은 메뉴: 복사 · 삭제 (단체방 담당자는 '안 읽은 사람'도).
 * 삭제는 한 번 더 눌러야 지워짐 (실수 방지). 메뉴는 말풍선 바로 아래(아래 입력칸에 가리면 위)에 뜸
 */
export default function MessageMenu({
  copy,
  remove,
  unread,
  mine = false,
  children,
}: {
  /** 단체방 담당자: 이 메시지를 안 읽은 사람 이름 + 그 사람들에게 다시 알림 */
  unread?: { names: string[]; nudge?: () => Promise<FormState> }
  /** 내가 보낸 말풍선(오른쪽)이면 메뉴도 오른쪽에 맞춤 */
  mine?: boolean
  /** 복사할 글자 (이모티콘·지운 메시지는 없음) */
  copy?: string | null
  /** 지울 수 있으면 지우는 서버 동작 */
  remove?: () => Promise<FormState>
  children: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  // 휴대폰에서 말풍선을 짧게 여러 번 톡톡 누르면 (이용 기록: 메뉴가 안 열려 계속 누름) '꾹 누르면…'을 한 번 알려 줌
  const taps = useRef<number[]>([])
  const [pos, setPos] = useState<{ top: number; left: number; keyboard: boolean } | null>(null)
  const [armed, setArmed] = useState(false)
  const [toast, setToast] = useState('')
  const [pending, startTransition] = useTransition()
  const [whoOpen, setWhoOpen] = useState(false)
  const [nudging, startNudge] = useTransition()
  const items = (copy ? 1 : 0) + (remove ? 1 : 0) + (unread ? 1 : 0)

  const close = useCallback(() => {
    setPos(null)
    setArmed(false)
    setWhoOpen(false)
  }, [])

  const show = useCallback((keyboard = false) => {
    const el = box.current
    if (!el || pos) return
    const r = el.getBoundingClientRect()
    const h = items * ITEM_H + 12
    const floor = floorY()
    const mineSide = el.dataset.side === 'right'
    const w = unread ? MENU_W_WIDE : MENU_W
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, mineSide ? r.right - w : r.left))
    const top = r.bottom + 6 + h <= floor ? r.bottom + 6 : Math.max(12, r.top - 6 - h)
    haptic(10)
    setPos({ top, left, keyboard })
  }, [items, pos, unread])

  // 열려 있는 동안: 바깥을 누르거나 Esc·화면을 움직이면 닫힘
  useEffect(() => {
    if (!pos) return
    const out = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !box.current?.contains(e.target as Node)) close()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        box.current?.focus()
      }
    }
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', close, { passive: true })
    window.addEventListener('resize', close)
    // 키보드로 열었을 때만 첫 항목에 초점 (손가락으로 열면 테두리 없이)
    if (pos.keyboard) menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('pointerdown', out)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', close)
      window.removeEventListener('resize', close)
    }
  }, [pos, close])

  // '안 읽은 사람'을 펼쳐 메뉴가 길어지면 화면 안으로 올림
  useLayoutEffect(() => {
    if (!pos || !menu.current) return
    const h = menu.current.offsetHeight
    const floor = floorY()
    if (pos.top + h > floor) setPos((p) => (p ? { ...p, top: Math.max(12, floor - h) } : p))
  }, [whoOpen, pos])

  // '한 번 더 누르면 삭제'는 3초 지나면 원래대로
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(t)
  }, [armed])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  if (!items) return <>{children}</>

  const cancelHold = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }

  const doCopy = async () => {
    if (!copy) return
    try {
      await navigator.clipboard.writeText(copy)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = copy
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    haptic(12)
    close()
    setToast('복사했어요')
  }

  const doRemove = () => {
    if (!remove) return
    if (!armed) {
      setArmed(true)
      haptic(15)
      return
    }
    startTransition(async () => {
      const r = await remove()
      close()
      if (r?.error) setToast(r.error)
      else haptic(12)
    })
  }

  return (
    <>
      <div
        ref={box}
        data-msg-menu
        data-side={mine ? 'right' : 'left'}
        data-open={pos ? '' : undefined}
        tabIndex={0}
        role="button"
        aria-haspopup="menu"
        aria-expanded={!!pos}
        aria-label="메시지 메뉴 열기 (복사·삭제)"
        className="group/msg relative min-w-0 rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-brand-500 data-[open]:scale-[0.98] data-[open]:ring-4 data-[open]:ring-brand-100"
        onContextMenu={(e) => {
          e.preventDefault()
          cancelHold()
          show()
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          start.current = { x: e.clientX, y: e.clientY }
          timer.current = window.setTimeout(() => {
            timer.current = null
            show()
          }, 450)
        }}
        onPointerMove={(e) => {
          const s = start.current
          if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancelHold()
        }}
        onPointerUp={(e) => {
          // 꾹 누르기 전에 뗌 = 짧게 누름 → 1.5초 안에 두 번이면 알려 줌
          if (timer.current && e.pointerType !== 'mouse') {
            const now = Date.now()
            taps.current = [...taps.current.filter((t) => now - t < 1500), now]
            if (taps.current.length >= 2) {
              taps.current = []
              setToast('꾹 누르면 복사·삭제 메뉴가 열려요')
            }
          }
          cancelHold()
        }}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            show(true)
          }
        }}
      >
        {children}
        {/* PC(마우스): 말풍선에 올리면 '오른쪽 클릭으로 메뉴'를 알려 주는 작은 표시 · 눌러도 메뉴가 열림 (휴대폰은 꾹 누르기) */}
        {items > 0 && !pos && (
          <span
            aria-hidden
            data-msg-hint
            title="오른쪽 클릭으로도 열 수 있어요"
            onClick={(e) => {
              e.stopPropagation()
              show()
            }}
            className={`absolute -top-3 z-10 hidden cursor-pointer items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-sub shadow-sm ring-1 ring-line [@media(hover:hover)_and_(pointer:fine)]:group-hover/msg:flex ${mine ? 'left-2' : 'right-2'}`}
          >
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="6" y="3" width="12" height="18" rx="6" />
              <path d="M12 3v6M12 9h6" />
            </svg>
            오른쪽 클릭 · {[copy && '복사', remove && '삭제', unread && '안 읽은 사람'].filter(Boolean).join('·')}
          </span>
        )}
      </div>
      {pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            data-msg-actions
            className="fixed z-50 animate-pop overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.18)] ring-1 ring-line"
            style={{ top: pos.top, left: pos.left, width: unread ? MENU_W_WIDE : MENU_W }}
          >
            {copy && (
              <button type="button" role="menuitem" className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[15px] font-semibold text-ink outline-none focus-visible:bg-bg active:bg-bg" onClick={doCopy}>
                <Icon name="copy" className="text-sub" />
                복사
              </button>
            )}
            {unread && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  aria-expanded={whoOpen}
                  data-unread-item
                  disabled={!unread.names.length}
                  className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[15px] font-semibold whitespace-nowrap text-ink outline-none focus-visible:bg-bg active:bg-bg disabled:text-mute"
                  onClick={() => {
                    haptic(8)
                    setWhoOpen((v) => !v)
                  }}
                >
                  <Icon name="eye" className="text-sub" />
                  {unread.names.length ? `안 읽은 사람 ${unread.names.length}명` : '모두 읽었어요'}
                </button>
                {whoOpen && unread.names.length > 0 && (
                  <div className="mx-1 mb-1 animate-pop rounded-xl bg-bg p-2.5" data-unread-list>
                    <ul className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                      {unread.names.map((n, i) => (
                        <li key={`${n}-${i}`} className="rounded-full bg-white px-2 py-0.5 text-[13px] font-semibold text-sub ring-1 ring-line">
                          {n}
                        </li>
                      ))}
                    </ul>
                    {unread.nudge && (
                      <button
                        type="button"
                        disabled={nudging}
                        data-unread-nudge
                        className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 text-[13px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
                        onClick={() =>
                          startNudge(async () => {
                            const r = await unread.nudge!()
                            close()
                            setToast(r?.error ?? r?.ok ?? '')
                            haptic(12)
                          })
                        }
                      >
                        <Icon name="bell" />
                        {nudging ? '보내는 중…' : '안 읽은 근무자에게 알림'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {remove && (
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                data-armed={armed ? '' : undefined}
                className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[15px] font-semibold whitespace-nowrap text-red-600 outline-none focus-visible:bg-red-50 active:bg-red-50 disabled:opacity-60 data-[armed]:bg-red-600 data-[armed]:text-white"
                onClick={doRemove}
              >
                <Icon name="trash" />
                {pending ? '지우는 중…' : armed ? '한 번 더 누르면 삭제' : '삭제'}
              </button>
            )}
          </div>,
          document.body,
        )}
      {toast &&
        createPortal(
          <p role="status" data-msg-toast className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-50 mx-auto w-fit max-w-[88vw] animate-pop rounded-full bg-ink/90 px-4 py-2 text-sm font-semibold text-white shadow-lg">
            {toast}
          </p>,
          document.body,
        )}
    </>
  )
}
