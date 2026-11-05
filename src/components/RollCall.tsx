'use client'

import { useEffect, useMemo, useState } from 'react'
import Avatar from './Avatar'
import Icon from './Icon'
import { ConfirmSubmit, haptic } from './ui'

export type RollPerson = {
  id: string
  name: string
  photoAt: string | null
  pos: string
  /** 미출근 · 근무 중 · 종료 */
  state: 'absent' | 'working' | 'done'
  /** 미출근인데 늦는다고 알렸거나 출근 확인을 요청한 경우 */
  hint?: string
}

/**
 * 출석 체크: 현장 입구에서 얼굴을 보며 온 사람을 눌러 체크 → 한 번에 '근무 시작'.
 * 끝날 때는 근무 중인 사람을 골라 한 번에 '근무 종료'. 종료한 사람은 고를 수 없음
 */
export default function RollCall({
  people,
  start,
  end,
  startTime,
  startPassed,
}: {
  people: RollPerson[]
  start: (form: FormData) => Promise<void>
  end: (form: FormData) => Promise<void>
  /** 근무 시작 시각 'HH:MM' */
  startTime: string
  /** 근무 시작 시각이 이미 지났는지 (지났으면 '시작 시각으로' 기록할 수 있음) */
  startPassed: boolean
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [at, setAt] = useState<'now' | 'start'>('now')
  // 처리하고 돌아오면 (상태가 바뀌면) 고른 것은 비움
  const sig = people.map((p) => `${p.id}:${p.state}`).join(',')
  useEffect(() => setPicked(new Set()), [sig])

  const stateOf = useMemo(() => new Map(people.map((p) => [p.id, p.state])), [people])
  const absent = people.filter((p) => p.state === 'absent')
  const working = people.filter((p) => p.state === 'working')
  const toStart = [...picked].filter((id) => stateOf.get(id) === 'absent')
  const toEnd = [...picked].filter((id) => stateOf.get(id) === 'working')

  const toggle = (id: string) => {
    haptic(8)
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const pickAll = (list: RollPerson[]) => {
    haptic(10)
    setPicked((s) => new Set([...[...s].filter((id) => !list.some((p) => p.id === id)), ...list.map((p) => p.id)]))
  }

  if (!people.length) return <div className="card py-10 text-center text-mute">이날 근무 명단이 없습니다.</div>

  return (
    <div className="space-y-3" data-roll-call>
      <div className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-100">
        <p className="font-bold">온 사람을 눌러 체크하세요</p>
        <ul className="mt-1 space-y-0.5 text-[13px] text-sub">
          <li>미출근자 체크 → 한 번에 <b className="text-ink">근무 시작</b></li>
          <li>근무 중인 사람 체크 → 한 번에 <b className="text-ink">근무 종료</b></li>
        </ul>
      </div>

      <div className="fade-x flex gap-1.5 overflow-x-auto pb-1">
        {absent.length > 0 && (
          <button type="button" className="chip shrink-0" onClick={() => pickAll(absent)} data-pick="absent">
            미출근 {absent.length}명 모두
          </button>
        )}
        {working.length > 0 && (
          <button type="button" className="chip shrink-0" onClick={() => pickAll(working)} data-pick="working">
            근무 중 {working.length}명 모두
          </button>
        )}
        {picked.size > 0 && (
          <button type="button" className="chip shrink-0" onClick={() => setPicked(new Set())} data-pick="none">
            체크 해제
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {people.map((p) => {
          const on = picked.has(p.id)
          const done = p.state === 'done'
          return (
            <button
              key={p.id}
              type="button"
              disabled={done}
              aria-pressed={on}
              data-roll={p.id}
              data-state={p.state}
              onClick={() => toggle(p.id)}
              className={`card relative flex flex-col items-center p-3 text-center transition duration-150 active:scale-[0.97] disabled:opacity-50 ${
                on ? 'bg-brand-50 ring-2 ring-brand-500' : ''
              }`}
            >
              <span
                aria-hidden
                className={`absolute top-2 right-2 grid size-6 place-items-center rounded-full text-white transition duration-150 ${
                  on ? 'scale-100 bg-brand-600' : done ? 'scale-0' : 'scale-100 bg-white ring-2 ring-line'
                }`}
              >
                {on && <Icon name="check" className="animate-pop" />}
              </span>
              <Avatar id={p.id} name={p.name} photoAt={p.photoAt} size="xl" zoom={false} />
              <p className="mt-2 w-full truncate text-[17px] font-bold">{p.name}</p>
              {p.pos && <p className="w-full truncate text-xs font-semibold text-brand-700">{p.pos}</p>}
              <span
                className={`badge mt-1.5 ${
                  p.state === 'absent' ? (p.hint ? 'bg-amber-100 text-amber-800' : 'bg-rose-50 text-rose-600') : p.state === 'working' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-sub'
                }`}
              >
                {p.state === 'absent' ? (p.hint ?? '미출근') : p.state === 'working' ? '근무 중' : '종료'}
              </span>
            </button>
          )
        })}
      </div>

      {/* 고른 사람이 있으면 아래에 붙는 처리 칸 (휴대폰은 아래 탭 위) */}
      {picked.size > 0 && (
        <div className="sticky bottom-[calc(var(--tabbar-space)+8px)] z-10 animate-pop space-y-2 rounded-2xl bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.14)] ring-1 ring-line sm:bottom-3" data-roll-bar>
          {toStart.length > 0 && (
            <form action={start} className="space-y-2">
              {toStart.map((id) => (
                <input key={id} type="hidden" name="user_ids" value={id} />
              ))}
              <input type="hidden" name="at" value={at} />
              {startPassed && (
                <div className="flex gap-1 rounded-xl bg-bg p-1 text-[13px] font-semibold" role="radiogroup" aria-label="근무 시작 시각">
                  {(
                    [
                      ['now', '지금 시각으로'],
                      ['start', `시작 시각 ${startTime}으로`],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={at === v}
                      onClick={() => setAt(v)}
                      className={`flex-1 rounded-lg py-1.5 whitespace-nowrap transition ${at === v ? 'bg-white text-ink shadow-sm' : 'text-mute'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <ConfirmSubmit className="btn-primary w-full" confirmText={`한 번 더 누르면 ${toStart.length}명 근무 시작`}>
                <span data-roll-start>체크한 {toStart.length}명 근무 시작</span>
              </ConfirmSubmit>
            </form>
          )}
          {toEnd.length > 0 && (
            <form action={end}>
              {toEnd.map((id) => (
                <input key={id} type="hidden" name="user_ids" value={id} />
              ))}
              <ConfirmSubmit className="btn-primary w-full bg-ink shadow-none" confirmText={`한 번 더 누르면 ${toEnd.length}명 근무 종료`}>
                <span data-roll-end>근무 중 {toEnd.length}명 근무 종료</span>
              </ConfirmSubmit>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
