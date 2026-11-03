'use client'

import { useEffect, useState } from 'react'
import { haptic } from './ui'

/** 준비물·복장을 하나씩 눌러 체크 (이 휴대폰에만 저장, 그날 그 근무 기준). 다 챙기면 '준비 끝!' */
export default function PrepChecklist({ storageKey, items }: { storageKey: string; items: string[] }) {
  const [done, setDone] = useState<string[]>([])
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      if (Array.isArray(v)) setDone(v.filter((x) => items.includes(x)))
    } catch {}
  }, [storageKey, items])
  const toggle = (it: string) => {
    haptic(8)
    setDone((d) => {
      const next = d.includes(it) ? d.filter((x) => x !== it) : [...d, it]
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {}
      return next
    })
  }
  const all = done.length === items.length
  return (
    <div className="mt-2 rounded-xl bg-bg px-3 py-2.5" data-prep-checklist>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className={all ? 'text-emerald-700' : 'text-sub'}>{all ? '✅ 준비 끝!' : '🎒 챙길 것 체크'}</span>
        <span className="tabular-nums text-mute" data-prep-count>
          {done.length}/{items.length}
        </span>
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-line/60" aria-hidden>
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${(done.length / items.length) * 100}%` }} />
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const on = done.includes(it)
          return (
            <li key={it}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(it)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition active:scale-95 ${on ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-white text-sub ring-line'}`}
              >
                <span key={String(on)} className={on ? 'inline-block animate-pop' : 'inline-block'}>
                  {on ? '✓' : '○'}
                </span>{' '}
                {it}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
