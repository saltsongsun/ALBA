'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Challenge } from '@/lib/playContent'
import { QUIZ_DONE_EVENT, QUIZ_WEEK } from './Quiz'
import { haptic } from '@/components/ui'

/** 이번 주 챌린지를 다 끝낸 축하(작은 폭죽)를 이 휴대폰에서 이미 본 주 — 한 주에 한 번만 */
const PARTY = 'play-challenges-party'
// 축하 점 8개 (가운데에서 바깥으로 · 색은 앱 색)
const DOTS = [
  { x: -70, y: -26, c: '#10b981' },
  { x: 70, y: -26, c: '#3b82f6' },
  { x: -46, y: 22, c: '#f59e0b' },
  { x: 46, y: 22, c: '#ec4899' },
  { x: -96, y: 4, c: '#3b82f6' },
  { x: 96, y: 4, c: '#10b981' },
  { x: -20, y: -34, c: '#ec4899' },
  { x: 20, y: -34, c: '#f59e0b' },
]

/**
 * 이번 주 챌린지 (놀이터): 기록으로 판단하는 것(근무·정시·글) + 이 휴대폰의 퀴즈 한 판.
 * 끝낸 것은 '✓ 완료'(톡 튐) · 남은 것은 눌러서 하러 가기 · 월요일마다 새로
 */
export default function Challenges({ items, week, daysLeft }: { items: Challenge[]; week: string; daysLeft: number }) {
  const [quiz, setQuiz] = useState(false)
  useEffect(() => {
    const read = () => {
      try {
        setQuiz(localStorage.getItem(QUIZ_WEEK) === week)
      } catch {}
    }
    read()
    window.addEventListener(QUIZ_DONE_EVENT, read)
    return () => window.removeEventListener(QUIZ_DONE_EVENT, read)
  }, [week])
  const all: Challenge[] = [...items, { key: 'w_quiz', label: '알바 상식 퀴즈 한 판', have: quiz ? 1 : 0, need: 1, href: '#quiz' }]
  const doneN = all.filter((c) => c.have >= c.need).length
  const allDone = doneN === all.length
  // 다 끝낸 주에 처음 볼 때만 작은 폭죽 + 짧은 진동 (다시 열면 조용히 · 움직임 줄이기면 점 없이) — 정기 개선 2026-11-21 11:35
  const [party, setParty] = useState(false)
  useEffect(() => {
    if (!allDone) return
    try {
      if (localStorage.getItem(PARTY) === week) return
      localStorage.setItem(PARTY, week)
    } catch {
      return
    }
    haptic([12, 40, 18])
    // 움직임 줄이기면 점을 아예 그리지 않음 (.burst는 화면 전체 CSS라 motion-reduce 클래스로는 못 숨김)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setParty(true)
    const t = window.setTimeout(() => setParty(false), 1200)
    return () => window.clearTimeout(t)
  }, [allDone, week])
  return (
    <section className="card" aria-label="이번 주 챌린지" data-challenges data-done={doneN}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">이번 주 챌린지</h2>
        <p className="shrink-0 text-xs text-mute">
          <b className={`tabular-nums ${allDone ? 'text-emerald-600' : 'text-ink'}`} data-challenges-count>
            {doneN}/{all.length}
          </b>{' '}
          · {daysLeft === 0 ? '오늘 밤 새로' : `${daysLeft}일 뒤 새로`}
        </p>
      </div>
      {allDone && (
        <p className="relative mt-2 animate-pop rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-bold text-emerald-700" data-challenges-all>
          🎉 이번 주 챌린지를 모두 끝냈어요!
          {party && (
            <span aria-hidden className="burst" data-challenges-party>
              {DOTS.map((d, i) => (
                <i key={i} style={{ '--x': `${d.x}px`, '--y': `${d.y}px`, background: d.c } as React.CSSProperties} />
              ))}
            </span>
          )}
        </p>
      )}
      <ul className="mt-2 divide-y divide-line">
        {all.map((c) => {
          const ok = c.have >= c.need
          const pct = Math.round((Math.min(c.have, c.need) / c.need) * 100)
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold break-keep ${ok ? 'text-mute line-through decoration-1' : 'text-ink'}`}>{c.label}</span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-bg" aria-hidden>
                  <span className={`block h-full rounded-full transition-[width] duration-300 ${ok ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${Math.max(pct, c.have > 0 ? 8 : 0)}%` }} />
                </span>
              </span>
              {/* 오른쪽 칸 너비를 고정 → 끝낸 줄·남은 줄의 막대 끝이 한 줄로 맞음 (정기 개선 2026-11-21 01:35) */}
              <span className="flex w-16 shrink-0 justify-end">
                {ok ? (
                  <span key="ok" className="animate-pop rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700" data-challenge-ok>
                    ✓ 완료
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-mute tabular-nums">
                    {Math.min(c.have, c.need)}/{c.need} <span aria-hidden>›</span>
                  </span>
                )}
              </span>
            </>
          )
          return (
            <li key={c.key} data-challenge={c.key} data-challenge-done={ok ? '1' : '0'}>
              {ok ? (
                <div className="flex items-center gap-3 py-2.5">{body}</div>
              ) : (
                <Link href={c.href} className="flex items-center gap-3 py-2.5 active:opacity-70">
                  {body}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
