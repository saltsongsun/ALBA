'use client'

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PACK, PACKS } from '@/lib/stickers'
import Icon from './Icon'
import { haptic } from './ui'

/**
 * 이모티콘 고르기 (대화 입력칸·커뮤니티 댓글·글쓰기 공용).
 * 위에 팩 탭(일하는 쥐돌이가 기본 · 병아리), 아래에 작은 그림(128px)과 문구. 누르면 onPick.
 * 키보드: 탭은 ←→, 그림은 Tab으로 옮겨 Enter, Esc로 닫기
 */
export default function StickerPicker({ onPick, onClose, title = '이모티콘' }: { onPick: (id: string, label: string) => void; onClose: () => void; title?: string }) {
  const [packId, setPackId] = useState(DEFAULT_PACK)
  const pack = PACKS.find((p) => p.id === packId) ?? PACKS[0]
  const tabsRef = useRef<HTMLDivElement>(null)
  // 열리면 지금 팩 탭으로 (키보드로 연 사람도 바로 고를 수 있게)
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus({ preventScroll: true })
  }, [])
  const moveTab = (dir: 1 | -1) => {
    const i = PACKS.findIndex((p) => p.id === pack.id)
    const next = PACKS[(i + dir + PACKS.length) % PACKS.length]
    setPackId(next.id)
    requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLButtonElement>(`[data-pack="${next.id}"]`)?.focus())
  }
  return (
    <div
      role="dialog"
      aria-label={title}
      data-sticker-picker
      className="animate-pop rounded-3xl bg-white p-2 shadow-[0_4px_20px_rgba(0,0,0,0.1)] ring-1 ring-line"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex items-center gap-1.5 px-0.5 pb-2">
        <div ref={tabsRef} role="tablist" aria-label="이모티콘 묶음" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {PACKS.map((p) => {
            const on = p.id === pack.id
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                data-pack={p.id}
                onClick={() => setPackId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') moveTab(1)
                  if (e.key === 'ArrowLeft') moveTab(-1)
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[13px] font-bold whitespace-nowrap transition active:scale-95 ${on ? 'bg-brand-600 text-white' : 'bg-bg text-sub'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 작은 고정 그림 */}
                <img src={p.thumb} alt="" width={26} height={26} className="size-[26px] rounded-full bg-white object-contain" draggable={false} />
                {p.name}
              </button>
            )
          })}
        </div>
        <button type="button" aria-label="이모티콘 닫기" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-mute transition hover:bg-bg active:scale-90">
          <Icon name="close" />
        </button>
      </div>
      <div role="tabpanel" aria-label={pack.name} className="grid max-h-[17.5rem] grid-cols-4 gap-1 overflow-y-auto overscroll-contain" data-sticker-grid={pack.id}>
        {pack.items.map((st) => (
          <button
            key={st.id}
            type="button"
            data-sticker-id={st.id}
            onClick={() => {
              haptic(12)
              onPick(st.id, st.label)
            }}
            className="flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 pt-1 pb-1.5 transition hover:bg-bg focus-visible:bg-bg active:scale-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 고르기 화면은 가벼운 128px 그림 */}
            <img src={st.thumb} alt="" width={64} height={64} loading="lazy" decoding="async" draggable={false} className="size-16 select-none object-contain" />
            <span className="line-clamp-2 w-full text-center text-[11px] leading-tight font-semibold break-keep text-sub">{st.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** 입력칸 옆 '이모티콘' 버튼 (메뉴·시스템 아이콘처럼 선 아이콘) */
export function StickerToggle({ open, onClick, className = '' }: { open: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="이모티콘"
      aria-expanded={open}
      aria-haspopup="dialog"
      data-sticker-toggle
      onClick={onClick}
      className={`grid size-11 shrink-0 place-items-center rounded-full text-[24px] transition active:scale-90 ${open ? 'bg-brand-50 text-brand-600' : 'text-sub hover:bg-bg'} ${className}`}
    >
      <Icon name="smile" />
    </button>
  )
}
