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
  const finished = people.filter((p) => p.state === 'done')
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

      {/* 작은 카드 3장씩 (사람이 많아도 위아래로 덜 길게) · 미출근 → 근무 중 순서 · 종료한 사람은 접어 둠 */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6" data-roll-grid>
        {[...absent, ...working].map((p) => (
          <Card key={p.id} p={p} on={picked.has(p.id)} onToggle={toggle} />
        ))}
      </div>
      {finished.length > 0 && (
        <details className="group rounded-2xl bg-white ring-1 ring-line" data-roll-done>
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-sub before:hidden [&::-webkit-details-marker]:hidden">
            종료 {finished.length}명
            <span className="text-xs text-mute group-open:hidden">펼치기</span>
            <span className="hidden text-xs text-mute group-open:inline">접기</span>
          </summary>
          <div className="grid grid-cols-3 gap-1.5 p-1.5 pt-0 sm:grid-cols-5 lg:grid-cols-6">
            {finished.map((p) => (
              <Card key={p.id} p={p} on={false} onToggle={toggle} />
            ))}
          </div>
        </details>
      )}

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

/** 작은 얼굴 카드 (사진 56px · 이름 · 배치 · 상태 점) — 눌러서 체크, 종료한 사람은 못 고름 */
function Card({ p, on, onToggle }: { p: RollPerson; on: boolean; onToggle: (id: string) => void }) {
  const done = p.state === 'done'
  const tone =
    p.state === 'absent' ? (p.hint ? 'text-amber-700' : 'text-rose-600') : p.state === 'working' ? 'text-emerald-700' : 'text-mute'
  const dot = p.state === 'absent' ? (p.hint ? 'bg-amber-500' : 'bg-rose-500') : p.state === 'working' ? 'bg-emerald-500' : 'bg-gray-300'
  return (
    <button
      type="button"
      disabled={done}
      aria-pressed={on}
      data-roll={p.id}
      data-state={p.state}
      onClick={() => onToggle(p.id)}
      className={`card relative flex min-w-0 flex-col items-center px-1.5 py-2.5 text-center transition duration-150 active:scale-[0.96] disabled:opacity-60 ${
        on ? 'bg-brand-50 ring-2 ring-brand-500' : ''
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full text-[11px] text-white transition duration-150 ${
          on ? 'scale-100 bg-brand-600' : done ? 'scale-0' : 'scale-100 bg-white ring-2 ring-line'
        }`}
      >
        {on && <Icon name="check" className="animate-pop" />}
      </span>
      <Avatar id={p.id} name={p.name} photoAt={p.photoAt} size="lg" zoom={false} />
      <p className="mt-1.5 w-full truncate text-[14px] leading-tight font-bold">{p.name}</p>
      <p className="w-full truncate text-[11px] leading-tight font-semibold text-brand-700">{p.pos || '\u00a0'}</p>
      <span className={`mt-1 inline-flex max-w-full items-center gap-1 text-[11px] font-bold ${tone}`}>
        <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{p.state === 'absent' ? (p.hint ?? '미출근') : p.state === 'working' ? '근무 중' : '종료'}</span>
      </span>
    </button>
  )
}
