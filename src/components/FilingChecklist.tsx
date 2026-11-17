'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Icon from './Icon'
import { haptic } from './ui'
import type { FilingDue } from '@/lib/filing'

/**
 * 관리자 홈: 지난달 근무가 있으면 이번 달 신고 마감을 한 칸에 (원천세 · 근로내용확인신고 · 일용근로소득 지급명세).
 * 줄을 누르면 그 달 신고자료 화면 · '✓ 했어요'를 누르면 그 줄이 접힘 (이 휴대폰에 회사·달마다 기억 — 회사를 바꾸면 따로)
 */
export default function FilingChecklist({ companyId, month, monthLabel, dues }: { companyId: string; month: string; monthLabel: string; dues: FilingDue[] }) {
  const keyOf = (k: string) => `filed:${companyId}:${month}:${k}`
  // 처음엔 숨겨 두고 기억을 읽은 뒤에 보여 줌 (이미 한 줄이 잠깐 보였다 사라지지 않게)
  const [done, setDone] = useState<Set<string> | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  useEffect(() => {
    const s = new Set<string>()
    for (const d of dues) {
      try {
        if (localStorage.getItem(keyOf(d.key))) s.add(d.key)
      } catch {}
    }
    setDone(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, month])
  if (!done) return null
  const left = dues.filter((d) => !done.has(d.key))
  if (!left.length) return null
  const mark = (k: string) => {
    haptic(10)
    setClosing(k)
    try {
      localStorage.setItem(keyOf(k), String(Date.now()))
    } catch {}
    setTimeout(() => {
      setDone((s) => new Set([...(s ?? []), k]))
      setClosing(null)
    }, 220)
  }
  const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
  return (
    <section className="card animate-pop space-y-1 p-4" data-filing>
      <h2 className="flex items-center gap-2 font-bold">
        <Icon name="calendar" className="text-brand-600" />
        {monthLabel}분 신고
      </h2>
      <ul className="divide-y divide-line">
        {left.map((d) => (
          <li
            key={d.key}
            className={`grid transition-all duration-200 ${closing === d.key ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'}`}
            data-filing-row={d.key}
          >
            <div className="flex min-h-0 items-center gap-2 overflow-hidden">
              <Link href={`/admin/reports?month=${month}`} className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-sm transition active:scale-[0.99]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{d.label}</span>
                  <span className="block truncate text-xs text-mute">
                    {md(d.due)}까지 · {d.where}
                  </span>
                </span>
                <b className={`shrink-0 tabular-nums ${d.left <= 3 ? 'text-rose-600' : 'text-sub'}`} data-filing-left={d.left}>
                  {d.left === 0 ? '오늘' : `D-${d.left}`}
                </b>
              </Link>
              <button type="button" onClick={() => mark(d.key)} className="chip h-8 shrink-0 px-2.5 text-xs" data-filing-done>
                ✓ 했어요
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
