'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import type { FormState } from '@/app/actions/auth'
import Icon from './Icon'
import { haptic } from './ui'

const MENU_W = 176
const ITEM_H = 46

/**
 * 말풍선을 꾹 누르면(PC는 오른쪽 클릭·키보드 Enter) 작은 메뉴: 복사 · 삭제.
 * 삭제는 한 번 더 눌러야 지워짐 (실수 방지). 메뉴는 말풍선 바로 아래(아래 입력칸에 가리면 위)에 뜸
 */
export default function MessageMenu({
  copy,
  remove,
  mine = false,
  children,
}: {
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
  const [pos, setPos] = useState<{ top: number; left: number; keyboard: boolean } | null>(null)
  const [armed, setArmed] = useState(false)
  const [toast, setToast] = useState('')
  const [pending, startTransition] = useTransition()
  const items = (copy ? 1 : 0) + (remove ? 1 : 0)

  const close = useCallback(() => {
    setPos(null)
    setArmed(false)
  }, [])

  const show = useCallback((keyboard = false) => {
    const el = box.current
    if (!el || pos) return
    const r = el.getBoundingClientRect()
    const h = items * ITEM_H + 12
    // 아래 입력칸(휴대폰은 탭 위에 붙어 있음)에 가리지 않게: 입력칸 위쪽까지만 씀
    const floor = Math.min(window.innerHeight, document.querySelector('[data-vv="end"]')?.getBoundingClientRect().top ?? window.innerHeight) - 8
    const mineSide = el.dataset.side === 'right'
    const left = Math.max(12, Math.min(window.innerWidth - MENU_W - 12, mineSide ? r.right - MENU_W : r.left))
    const top = r.bottom + 6 + h <= floor ? r.bottom + 6 : Math.max(12, r.top - 6 - h)
    haptic(10)
    setPos({ top, left, keyboard })
  }, [items, pos])

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
        className="min-w-0 rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-brand-500 data-[open]:scale-[0.98] data-[open]:ring-4 data-[open]:ring-brand-100"
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
        onPointerUp={cancelHold}
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
      </div>
      {pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            data-msg-actions
            className="fixed z-50 animate-pop overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.18)] ring-1 ring-line"
            style={{ top: pos.top, left: pos.left, width: MENU_W }}
          >
            {copy && (
              <button type="button" role="menuitem" className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[15px] font-semibold text-ink outline-none focus-visible:bg-bg active:bg-bg" onClick={doCopy}>
                <Icon name="copy" className="text-sub" />
                복사
              </button>
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
