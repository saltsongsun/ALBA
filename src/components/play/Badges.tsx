'use client'

import { useEffect, useState } from 'react'
import type { Badge } from '@/lib/playContent'

const SEEN = 'play-badges-seen'

/**
 * 배지 모음 (놀이터): 얻은 배지는 색 · 아직이면 흐리게 + 'n/목표' 막대.
 * 지난번에 본 뒤 새로 얻은 배지는 '새로!'와 함께 톡 튐 (이 휴대폰에서 본 것과 비교)
 */
export default function Badges({ items }: { items: Badge[] }) {
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const got = items.filter((b) => b.have >= b.need)
  const gotKeys = got.map((b) => b.key).join(',')
  useEffect(() => {
    const keys = gotKeys ? gotKeys.split(',') : []
    try {
      const raw = localStorage.getItem(SEEN)
      const seen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
      // 처음 여는 날엔 '새로!' 없이 기억만 (이미 얻은 것을 한꺼번에 새로라고 하지 않게)
      if (raw) setFresh(new Set(keys.filter((k) => !seen.has(k))))
      localStorage.setItem(SEEN, JSON.stringify(keys))
    } catch {}
  }, [gotKeys])
  // 얻은 것 먼저 (같은 묶음 안에서는 원래 순서)
  const sorted = [...got, ...items.filter((b) => b.have < b.need)]
  return (
    <section className="card" aria-label="배지" data-badges data-badges-got={got.length}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">내 배지</h2>
        <p className="shrink-0 text-xs text-mute">
          <b className="text-ink tabular-nums">{got.length}</b>/{items.length}개 모음
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {sorted.map((b) => {
          const ok = b.have >= b.need
          const isNew = fresh.has(b.key)
          return (
            <li
              key={b.key}
              data-badge={b.key}
              data-badge-got={ok ? '1' : '0'}
              className={`relative flex min-w-0 flex-col items-center rounded-2xl px-1.5 pt-2.5 pb-2 text-center ${ok ? 'bg-amber-50/70' : 'bg-bg/70'} ${isNew ? 'animate-pop ring-2 ring-amber-300' : ''}`}
            >
              {isNew && (
                <span className="absolute -top-1.5 right-1 rounded-full bg-amber-400 px-1.5 py-px text-[10px] font-extrabold text-white" data-badge-new>
                  새로!
                </span>
              )}
              <span aria-hidden className={`text-[26px] leading-none ${ok ? '' : 'opacity-35 grayscale'}`}>
                {b.icon}
              </span>
              <b className={`mt-1.5 w-full truncate text-xs ${ok ? 'text-ink' : 'text-sub'}`}>{b.name}</b>
              <span className="mt-0.5 text-[11px] leading-tight break-keep text-balance text-mute">{b.goal}</span>
              {!ok && (
                <span className="mt-1.5 flex w-full items-center gap-1" aria-label={`${b.have}/${b.need}`}>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-line/70">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.round((Math.min(b.have, b.need) / b.need) * 100)}%` }} />
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold text-mute tabular-nums">
                    {Math.min(b.have, b.need)}/{b.need}
                  </span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
