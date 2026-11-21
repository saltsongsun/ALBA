'use client'

/**
 * 커뮤니티 2단계 화면 조각 (사용자 요청 2026-11-21 "커뮤니티 2단계도 진행해줘"):
 * 투표 카드 · 이모지 반응 줄 · 놀이터 출석 체크 카드.
 * 누르면 바로 바뀌고(서버 결과로 맞춤) 짧게 톡 튐 (0.25초 · 움직임 줄이기면 없음)
 */
import { useState, useTransition } from 'react'
import { checkIn, toggleReaction, votePoll } from '@/app/actions/community'
import { REACTIONS, type ReactionKey } from '@/lib/communityShared'
import { haptic } from './ui'

type PollView = { options: string[]; counts: number[]; total: number; mine: number | null }

/** 투표: 고르기 전에는 보기만 · 고른 뒤(또는 글쓴이)에는 막대로 결과 · 다른 보기를 누르면 바꾸고, 같은 보기를 다시 누르면 취소 */
export function PollCard({ postId, poll: p0, canVote, isAuthor }: { postId: string; poll: PollView; canVote: boolean; isAuthor: boolean }) {
  const [poll, setPoll] = useState(p0)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const showResults = poll.mine != null || isAuthor || !canVote
  const top = Math.max(...poll.counts)
  return (
    <section className="space-y-2.5 rounded-2xl bg-bg p-3.5" aria-label="투표" data-poll data-poll-voted={poll.mine != null ? '' : undefined}>
      <p className="flex items-center justify-between gap-2 text-sm">
        <b>📊 투표</b>
        <span className="text-xs text-mute tabular-nums" data-poll-total>
          {poll.total}명 참여
        </span>
      </p>
      <ul className="space-y-1.5">
        {poll.options.map((o, i) => {
          const n = poll.counts[i] ?? 0
          const pct = poll.total ? Math.round((n / poll.total) * 100) : 0
          const mine = poll.mine === i
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!canVote || pending}
                aria-pressed={mine}
                onClick={() => {
                  setErr('')
                  // 바로 바꿔 보여 주고 서버 결과로 맞춤
                  const prev = poll
                  const counts = [...poll.counts]
                  if (poll.mine != null) counts[poll.mine]--
                  const next = mine ? null : i
                  if (next != null) counts[next]++
                  setPoll({ ...poll, counts, mine: next, total: poll.total + (poll.mine == null ? 1 : 0) - (next == null ? 1 : 0) })
                  haptic(8)
                  start(async () => {
                    const r = await votePoll(postId, i)
                    if ('error' in r) {
                      setPoll(prev)
                      setErr(r.error)
                    } else setPoll(r)
                  })
                }}
                className={`relative flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-xl bg-white px-3 py-2 text-left text-sm ring-1 transition active:scale-[0.99] disabled:cursor-default ${
                  mine ? 'font-bold text-brand-700 ring-brand-300' : 'text-ink ring-line'
                }`}
                data-poll-option={i}
              >
                {/* 결과 막대: 고른 뒤에만 · 0.3초에 걸쳐 채워짐 (움직임 줄이기면 바로) */}
                {showResults && (
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 transition-[width] duration-300 ease-out ${mine ? 'bg-brand-100' : n === top && n > 0 ? 'bg-amber-100' : 'bg-slate-100'}`}
                    style={{ width: `${pct}%` }}
                    data-poll-bar
                  />
                )}
                <span className="relative min-w-0 flex-1 break-words">
                  {mine && (
                    <span aria-hidden key={`m${poll.total}`} className="mr-1 inline-block animate-[pop_0.25s_ease-out_both]">
                      ✓
                    </span>
                  )}
                  {o}
                </span>
                {showResults && (
                  <span className="relative shrink-0 text-xs font-semibold text-sub tabular-nums" data-poll-count>
                    {pct}% · {n}표
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-mute" data-poll-hint>
        {!canVote ? '읽기만 할 수 있는 계정이에요.' : poll.mine == null ? (isAuthor ? '내 글이라도 투표할 수 있어요.' : '하나를 고르면 결과가 보여요.') : '다른 보기를 누르면 바뀌고, 다시 누르면 취소돼요.'}
      </p>
      {err && (
        <p className="text-xs font-semibold text-rose-600" role="alert">
          {err}
        </p>
      )}
    </section>
  )
}

type ReactionView = { counts: Record<ReactionKey, number>; mine: ReactionKey[]; total: number }

/** 이모지 반응 다섯 가지: 누르면 숫자가 바로 바뀌고 이모지가 톡 (다시 누르면 취소) */
export function ReactionBar({ postId, view: v0, enabled }: { postId: string; view: ReactionView; enabled: boolean }) {
  const [view, setView] = useState(v0)
  const [pop, setPop] = useState<{ key: string; n: number }>({ key: '', n: 0 })
  const [, start] = useTransition()
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="반응 남기기" data-reactions>
      {REACTIONS.map((r) => {
        const n = view.counts[r.key] ?? 0
        const on = view.mine.includes(r.key)
        return (
          <button
            key={r.key}
            type="button"
            disabled={!enabled}
            aria-pressed={on}
            aria-label={`${r.label} ${n}`}
            title={r.label}
            onClick={() => {
              const prev = view
              const counts = { ...view.counts, [r.key]: n + (on ? -1 : 1) }
              setView({ counts, mine: on ? view.mine.filter((k) => k !== r.key) : [...view.mine, r.key], total: view.total + (on ? -1 : 1) })
              if (!on) {
                setPop((p) => ({ key: r.key, n: p.n + 1 }))
                haptic(8)
              }
              start(async () => {
                const res = await toggleReaction(postId, r.key)
                setView('error' in res ? prev : res)
              })
            }}
            className={`inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-sm ring-1 transition duration-150 active:scale-95 disabled:opacity-60 ${
              on ? 'bg-brand-50 font-bold text-brand-700 ring-brand-200' : 'bg-white text-sub ring-line'
            }`}
            data-reaction={r.key}
            data-reaction-on={on ? '' : undefined}
          >
            <span aria-hidden key={pop.key === r.key ? pop.n : 0} className={pop.key === r.key && pop.n ? 'inline-block animate-[pop_0.25s_ease-out_both]' : 'inline-block'}>
              {r.emoji}
            </span>
            {n > 0 && <span className="tabular-nums">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}

type CheckinView = { date: string; current: number; best: number; done: boolean; week: { day: string; done: boolean; isToday: boolean; future: boolean }[] }
const DOW = ['월', '화', '수', '목', '금', '토', '일']

/** 놀이터 출석 체크: 이번 주 7칸 · 연속 기록 · 하루 한 번 '오늘 출석하기' */
export function CheckinCard({ view: v0, ranked }: { view: CheckinView; ranked: boolean }) {
  const [view, setView] = useState(v0)
  const [err, setErr] = useState('')
  const [justNow, setJustNow] = useState(false)
  const [pending, start] = useTransition()
  return (
    <section id="checkin" className="card scroll-mt-20 space-y-3" aria-label="출석 체크" data-checkin data-checkin-done={view.done ? '' : undefined}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">📅 출석 체크</h2>
        {view.current > 0 && (
          <span key={view.current} className={`rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-600 tabular-nums ${justNow ? 'animate-[pop_0.25s_ease-out_both]' : ''}`} data-streak={view.current}>
            🔥 {view.current}일째
          </span>
        )}
      </div>
      {/* 이번 주 월~일: 출석한 날 ✓ · 오늘은 점선 테두리 */}
      <ol className="grid grid-cols-7 gap-1 text-center" data-checkin-week>
        {view.week.map((d, i) => (
          <li key={d.day} className="space-y-1" data-checkin-day={d.done ? 'done' : d.isToday ? 'today' : d.future ? 'future' : 'missed'}>
            <span className={`block text-[11px] ${d.isToday ? 'font-bold text-ink' : 'text-mute'}`}>{DOW[i]}</span>
            <span
              aria-label={`${DOW[i]}요일 ${d.done ? '출석' : d.future ? '아직' : d.isToday ? '오늘' : '안 함'}`}
              className={`mx-auto grid size-8 place-items-center rounded-full text-xs font-bold ${
                d.done ? 'bg-brand-600 text-white' : d.isToday ? 'border-2 border-dashed border-brand-300 text-brand-600' : d.future ? 'bg-bg text-line' : 'bg-bg text-mute'
              } ${d.done && d.isToday && justNow ? 'animate-[pop_0.25s_ease-out_both]' : ''}`}
            >
              {d.done ? '✓' : '·'}
            </span>
          </li>
        ))}
      </ol>
      {view.done ? (
        <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700" data-checkin-ok>
          <span aria-hidden className={justNow ? 'inline-block animate-[pop_0.25s_ease-out_both]' : ''}>
            ✓
          </span>
          <span className="min-w-0 flex-1">
            오늘 출석했어요{ranked ? ' · 랭킹 +10점' : ''}
          </span>
          <span className="shrink-0 text-xs font-normal text-sub">내일 오면 {view.current + 1}일째</span>
        </p>
      ) : (
        <button
          type="button"
          disabled={pending}
          className="btn-primary w-full py-3"
          onClick={() => {
            setErr('')
            start(async () => {
              const r = await checkIn()
              if ('error' in r) setErr(r.error)
              else {
                setView(r)
                setJustNow(true)
                haptic([10, 30, 10])
              }
            })
          }}
          data-checkin-go
        >
          {pending ? '출석하는 중…' : view.current > 0 ? `오늘 출석하기 · 🔥 ${view.current + 1}일째로` : '오늘 출석하기'}
        </button>
      )}
      <p className="text-xs text-mute" data-checkin-best>
        하루 한 번 · 최고 기록 <b className="text-sub tabular-nums">{Math.max(view.best, view.current)}일</b>
        {view.best >= 7 ? ' 🔥' : ' · 7일 이어서 하면 🔥 배지'}
      </p>
      {err && (
        <p className="text-xs font-semibold text-rose-600" role="alert">
          {err}
        </p>
      )}
    </section>
  )
}
