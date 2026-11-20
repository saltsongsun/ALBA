'use client'

import { useEffect, useState } from 'react'
import { pickQuiz, type QuizItem } from '@/lib/playContent'
import { haptic, ShareButton } from '@/components/ui'

const BEST = 'play-quiz-best'
export const QUIZ_WEEK = 'play-quiz-week'
export const QUIZ_DONE_EVENT = 'play-quiz-done'
const N = 5

/**
 * 알바 상식 퀴즈 (놀이터): 5문제 · 고르면 바로 맞음/틀림 + 짧은 풀이 · 최고 기록은 이 휴대폰에만.
 * 한 판 끝내면 이번 주 챌린지 '퀴즈 한 판' 완료 (월요일마다 새로). 점수는 재미용 — 어디에도 저장·전송하지 않음
 */
export default function Quiz({ week }: { week: string }) {
  const [set, setSet] = useState<QuizItem[] | null>(null)
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState<number | null>(null)
  const [newBest, setNewBest] = useState(false)
  const [done, setDone] = useState(false)
  useEffect(() => {
    try {
      const b = localStorage.getItem(BEST)
      if (b != null) setBest(Number(b))
    } catch {}
  }, [])

  // 시작·다음 문제: 문제 카드 머리가 화면 위로 지나갔으면(또는 시작) 카드 맨 위가 보이게 (움직임 줄이기면 바로)
  const toTop = (always: boolean) =>
    requestAnimationFrame(() => {
      const el = document.getElementById('quiz')
      if (!el || (!always && el.getBoundingClientRect().top >= 64)) return
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    })
  const start = () => {
    haptic(10)
    toTop(true)
    setSet(pickQuiz(Math.random, N))
    setI(0)
    setPicked(null)
    setScore(0)
    setDone(false)
    setNewBest(false)
  }
  const choose = (n: number) => {
    if (!set || picked != null) return
    const right = n === set[i].answer
    haptic(right ? 12 : [20, 40, 20])
    setPicked(n)
    if (right) setScore((s) => s + 1)
  }
  const next = () => {
    if (!set) return
    if (i + 1 < set.length) {
      setI(i + 1)
      setPicked(null)
      toTop(false)
      return
    }
    // 끝: 최고 기록 · 이번 주 챌린지
    setDone(true)
    try {
      if (best == null || score > best) {
        localStorage.setItem(BEST, String(score))
        setNewBest(best != null)
        setBest(score)
      }
      localStorage.setItem(QUIZ_WEEK, week)
    } catch {}
    window.dispatchEvent(new Event(QUIZ_DONE_EVENT))
  }

  // 시작 전
  if (!set) {
    return (
      <div className="flex items-center gap-3" data-quiz="idle">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-2xl">
          🧠
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">알바 상식 퀴즈</p>
          <p className="text-xs break-keep text-sub">
            {N}문제 · 주휴수당·최저시급·쉬는 시간
            {best != null && (
              <>
                {' '}
                · 최고 <b className="text-ink tabular-nums" data-quiz-best>{best}/{N}</b>
              </>
            )}
          </p>
        </div>
        <button type="button" onClick={start} className="btn-primary btn-sm shrink-0" data-quiz-start>
          시작
        </button>
      </div>
    )
  }

  // 결과
  if (done) {
    const msg = score === N ? '완벽해요! 알바 박사 🎓' : score >= 3 ? '잘했어요! 거의 다 알아요 👍' : '풀이를 보면 금방 늘어요 💪'
    return (
      <div className="text-center" data-quiz="done" data-quiz-score={score}>
        <p className="text-xs font-semibold text-mute">알바 상식 퀴즈 결과</p>
        <p className="mt-1 animate-pop text-4xl font-extrabold tabular-nums text-ink">
          {score}
          <span className="text-xl text-mute">/{N}</span>
        </p>
        <p className="mt-1 text-sm font-semibold break-keep text-sub">{msg}</p>
        {newBest && (
          <p className="mx-auto mt-2 w-fit animate-pop rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700" data-quiz-newbest>
            🏆 최고 기록!
          </p>
        )}
        <p className="mt-2 text-xs text-emerald-700" data-quiz-week-done>
          ✓ 이번 주 챌린지 &lsquo;퀴즈 한 판&rsquo; 완료
        </p>
        {/* 다시 풀기 + 결과 자랑하기 (점수만 보냄 · 휴대폰은 공유 창, PC는 링크 복사) — 정기 개선 2026-11-21 01:35 */}
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" onClick={start} className="btn-soft btn-sm" data-quiz-again>
            다시 풀기
          </button>
          <span data-quiz-share className="contents">
            <ShareButton
              title="해피워크 놀이터"
              text={`알바 상식 퀴즈 ${score}/${N}점! 너도 풀어 봐 🧠`}
              path="/community/play#quiz"
              className="btn-primary btn-sm"
              label="결과 자랑하기"
            />
          </span>
        </div>
      </div>
    )
  }

  // 푸는 중
  const q = set[i]
  return (
    <div data-quiz="play" data-quiz-index={i}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-label={`${N}문제 중 ${i + 1}번째`}>
          {set.map((_, k) => (
            <span key={k} className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${k < i || (k === i && picked != null) ? 'bg-emerald-500' : k === i ? 'bg-emerald-200' : 'bg-bg'}`} />
          ))}
        </div>
        <span className="shrink-0 text-xs font-semibold text-mute tabular-nums">
          {i + 1}/{N}
        </span>
      </div>
      <p key={i} className="mt-3 animate-rise text-[15px] font-bold break-keep text-balance" data-quiz-q>
        Q. {q.q}
      </p>
      <div className="mt-3 grid gap-2">
        {q.choices.map((c, n) => {
          const isAns = n === q.answer
          const state = picked == null ? 'idle' : isAns ? 'right' : n === picked ? 'wrong' : 'dim'
          return (
            <button
              key={`${i}-${n}`}
              type="button"
              onClick={() => choose(n)}
              disabled={picked != null && state === 'dim'}
              aria-pressed={picked === n}
              data-quiz-choice={state}
              className={`flex min-h-11 items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-left text-sm font-semibold break-keep ring-1 transition duration-150 ${
                state === 'right'
                  ? 'animate-pop bg-emerald-50 text-emerald-800 ring-emerald-300'
                  : state === 'wrong'
                    ? 'animate-shake bg-rose-50 text-rose-700 ring-rose-200'
                    : state === 'dim'
                      ? 'bg-white text-mute ring-line disabled:opacity-60'
                      : 'bg-white text-ink ring-line active:scale-[0.98]'
              }`}
            >
              <span className="min-w-0 flex-1">{c}</span>
              {state === 'right' && <span aria-label="정답">✓</span>}
              {state === 'wrong' && <span aria-label="오답">✕</span>}
            </button>
          )
        })}
      </div>
      {picked != null && (
        <div className="mt-3 animate-rise" data-quiz-why>
          <p className={`rounded-xl px-3 py-2 text-xs leading-relaxed break-keep ${picked === q.answer ? 'bg-emerald-50 text-emerald-800' : 'bg-bg text-sub'}`}>
            <b>{picked === q.answer ? '정답이에요! ' : '아쉬워요. '}</b>
            {q.why}
          </p>
          <button type="button" onClick={next} className="btn-primary mt-3 w-full" data-quiz-next>
            {i + 1 < set.length ? '다음 문제 →' : '결과 보기'}
          </button>
        </div>
      )}
    </div>
  )
}
