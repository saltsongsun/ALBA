'use client'

import { useActionState, useRef, useState } from 'react'
import { changeShift } from '@/app/actions/admin'
import { FormMessage, keepInputs, SubmitButton } from './ui'
import Icon from './Icon'

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const toTime = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * 근무시간 변경·퇴근 연장 (관리자 출퇴근 탭). 이날만 또는 전체 일정.
 * 보내면 근무자마다 '계속하시겠습니까?' 동의를 받음
 */
export default function ShiftChange({
  jobId,
  date,
  dateLabel,
  canDay,
  start,
  end,
  workers,
  open = false,
}: {
  jobId: string
  date: string
  dateLabel: string
  /** 이날만 바꿀 수 있는지 (지난 날은 안 됨) */
  canDay: boolean
  start: string
  end: string
  workers: { id: string; name: string }[]
  open?: boolean
}) {
  const [state, action] = useActionState(changeShift.bind(null, jobId), null)
  const [scope, setScope] = useState(canDay ? date : 'all')
  const endRef = useRef<HTMLInputElement>(null)
  const [endV, setEndV] = useState(end.slice(0, 5))
  const extend = (min: number) => setEndV(toTime(toMin(end.slice(0, 5)) + min))
  // ✏️ 정기 개선 2026-11-27 21:36: 바꿀 근무자 — 처음엔 모두 고름 · '모두 풀기/모두 고르기'로 한 번에 (사람이 많을 때 하나씩 끄지 않게) · 고른 수 표시
  const [picked, setPicked] = useState<Set<string>>(() => new Set(workers.map((w) => w.id)))
  const allPicked = workers.length > 0 && picked.size === workers.length
  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <details id="shift" open={open} className="card scroll-mt-24 p-4">
      <summary className="tap cursor-pointer font-bold">
        <Icon name="clock" className="text-brand-600" /> 근무시간 변경 · 퇴근 연장
      </summary>
      <form action={action} onReset={keepInputs} className="mt-3 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              [date, `이날만 (${dateLabel})`, canDay],
              ['all', '전체 일정', true],
            ] as const
          ).map(([value, label, ok]) =>
            ok ? (
              <label
                key={value}
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-center text-sm font-bold ring-1 transition active:scale-95 ${
                  scope === value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-sub ring-line'
                }`}
              >
                <input type="radio" name="scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="sr-only" />
                {label}
              </label>
            ) : null,
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">시작</span>
            <input type="time" name="start_time" className="input" defaultValue={start.slice(0, 5)} required />
          </label>
          <label>
            <span className="label">종료</span>
            <input ref={endRef} type="time" name="end_time" className="input" value={endV} onChange={(e) => setEndV(e.target.value)} required />
          </label>
        </div>
        {/* 퇴근 연장을 한 번에 */}
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs font-semibold text-mute">지금 종료 {end.slice(0, 5)}에서</span>
          {[30, 60, 90, 120].map((m) => (
            <button key={m} type="button" onClick={() => extend(m)} className="chip h-8 px-3 text-xs">
              +{m >= 60 ? `${m / 60}시간` : `${m}분`}
            </button>
          ))}
        </div>
        <input name="reason" maxLength={100} className="input text-sm" placeholder="사유 (선택) 예: 행사 진행이 늦어져 연장" />
        {scope !== 'all' && (
          <fieldset>
            {/* ✏️ 정기 개선 2026-11-27 21:36: 고른 수 (바뀌면 0.25초 톡) + 모두 풀기/고르기 · 2명 이상일 때만 */}
            <legend className="label flex w-full items-center justify-between gap-2">
              <span>
                바꿀 근무자 (
                <b key={picked.size} className="inline-block animate-pop tabular-nums [animation-duration:250ms]" data-shift-picked={picked.size}>
                  {picked.size === workers.length ? `${workers.length}명` : `${picked.size}/${workers.length}명`}
                </b>
                )
              </span>
              {workers.length > 1 && (
                <button
                  type="button"
                  className="tap shrink-0 text-xs font-semibold text-brand-600 transition active:scale-95"
                  onClick={() => setPicked(allPicked ? new Set() : new Set(workers.map((w) => w.id)))}
                  data-shift-all
                >
                  {allPicked ? '모두 풀기' : '모두 고르기'}
                </button>
              )}
            </legend>
            {workers.length === 0 ? (
              <p className="text-sm text-mute">이날 근무하는 확정자가 없어요.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {workers.map((w) => (
                  <label key={w.id} className="has-checked:bg-brand-50 has-checked:text-brand-700 has-checked:ring-brand-500 flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-sub ring-1 ring-line">
                    <input type="checkbox" name="uid" value={w.id} checked={picked.has(w.id)} onChange={() => togglePick(w.id)} className="size-4 accent-brand-600" />
                    {w.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}
        <p className="hint">
          보내면 근무자마다 앱에서 ‘계속하시겠습니까?’에 답해요. 동의한 사람만 바뀐 시간까지 급여가 계산되고, 어렵다고 하면 원래 시간대로 남아요
          {scope === 'all' ? ' (전체 일정이 바뀌면 근무 확정이 취소돼요)' : ''}. 이미 일한 날은 바뀌지 않아요.
        </p>
        <FormMessage state={state} />
        {/* ✏️ 정기 개선 2026-11-27 21:36: 이날만 바꿀 때 아무도 안 골랐으면 보내기 전에 바로 알려 줌 (서버도 같은 확인) */}
        {scope !== 'all' && workers.length > 0 && picked.size === 0 && (
          <p className="animate-pop text-center text-xs font-semibold text-amber-700 [animation-duration:250ms]" data-shift-none>
            바꿀 근무자를 한 명 이상 골라 주세요
          </p>
        )}
        <SubmitButton className="btn-primary w-full" pendingText="보내는 중…" disabled={scope !== 'all' && workers.length > 0 && picked.size === 0}>
          근무자에게 동의 요청 보내기
        </SubmitButton>
      </form>
    </details>
  )
}
