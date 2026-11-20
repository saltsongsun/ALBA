'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Challenge } from '@/lib/playContent'
import { QUIZ_DONE_EVENT, QUIZ_WEEK } from './Quiz'

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
  return (
    <section className="card" aria-label="이번 주 챌린지" data-challenges data-done={doneN}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">이번 주 챌린지</h2>
        <p className="shrink-0 text-xs text-mute">
          <b className={`tabular-nums ${doneN === all.length ? 'text-emerald-600' : 'text-ink'}`} data-challenges-count>
            {doneN}/{all.length}
          </b>{' '}
          · {daysLeft === 0 ? '오늘 밤 새로' : `${daysLeft}일 뒤 새로`}
        </p>
      </div>
      {doneN === all.length && (
        <p className="mt-2 animate-pop rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-bold text-emerald-700" data-challenges-all>
          🎉 이번 주 챌린지를 모두 끝냈어요!
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
              {ok ? (
                <span key="ok" className="shrink-0 animate-pop rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700" data-challenge-ok>
                  ✓ 완료
                </span>
              ) : (
                <span className="shrink-0 text-xs font-semibold text-mute tabular-nums">
                  {Math.min(c.have, c.need)}/{c.need} <span aria-hidden>›</span>
                </span>
              )}
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
