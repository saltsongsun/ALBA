'use client'

import { useActionState, useRef, useState } from 'react'
import { changeShift, remindShiftAnswer } from '@/app/actions/admin' // ✏️ 정기 개선 2026-11-27 23:35: remindShiftAnswer
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
  answers,
  canRemind = false,
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
  /** ✏️ 정기 개선 2026-11-27 23:35: 이날(또는 전체 일정)로 보낸 변경 요청의 답 — 확정자마다 가장 최근 것 (출퇴근 탭 숫자와 같음) */
  answers?: { agreed: number; declined: number; waiting: { id: string; name: string }[] }
  /** 답 안 한 사람에게 다시 알리기 (오늘·앞으로의 날만) */
  canRemind?: boolean
}) {
  const [state, action] = useActionState(changeShift.bind(null, jobId), null)
  // ✏️ 정기 개선 2026-11-27 23:35: 답 안 한 사람에게 다시 알리기 (화면은 그대로 · 결과 한 줄)
  const [reminded, remind] = useActionState(remindShiftAnswer.bind(null, jobId, date), null)
  const sent = answers ? answers.agreed + answers.declined + answers.waiting.length : 0
  const waitN = answers?.waiting.length ?? 0
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
        {/* ✏️ 정기 개선 2026-11-27 23:35: 접어 둬도 답을 기다리는 사람이 있으면 보이게 */}
        {waitN > 0 && (
          <span key={waitN} className="badge ml-1.5 animate-pop bg-amber-50 align-middle text-xs text-amber-800 [animation-duration:250ms]" data-shift-wait-badge={waitN}>
            답 대기 {waitN}
          </span>
        )}
      </summary>
      {/* ✏️ 정기 개선 2026-11-27 23:35: 보낸 요청의 답 — 동의·어려움·대기 한 줄 + 막대 (0.25초 채워짐) · 대기 이름 + 다시 알리기 */}
      {sent > 0 && answers && (
        <div className="mt-3 rounded-xl bg-bg px-3 py-2.5" data-shift-answers>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="shrink-0 font-semibold">보낸 요청 답</span>
            <span className="truncate text-xs text-sub tabular-nums">
              동의 <b className="text-emerald-700">{answers.agreed}</b> · 어려움 <b className="text-rose-600">{answers.declined}</b> · 대기{' '}
              <b className="text-amber-700">{waitN}</b>
            </span>
          </div>
          <div className="mt-2 flex h-1.5 origin-left animate-[grow_0.25s_ease-out_both] gap-0.5 overflow-hidden rounded-full motion-reduce:animate-none" aria-hidden>
            {answers.agreed > 0 && <span className="h-full rounded-full bg-emerald-500" style={{ flexGrow: answers.agreed }} />}
            {answers.declined > 0 && <span className="h-full rounded-full bg-rose-400" style={{ flexGrow: answers.declined }} />}
            {waitN > 0 && <span className="h-full rounded-full bg-amber-300" style={{ flexGrow: waitN }} />}
          </div>
          {waitN > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-xs text-sub" data-shift-waiting>
                아직: {answers.waiting.map((w) => w.name).join(', ')}
              </p>
              {canRemind && (
                <form action={remind} className="shrink-0" data-shift-remind>
                  <SubmitButton className="chip h-8 px-3 text-xs" pendingText="보내는 중…" track="근무시간 변경 다시 알리기">
                    다시 알리기
                  </SubmitButton>
                </form>
              )}
            </div>
          )}
          {reminded && (
            <p
              key={reminded.ok ?? reminded.error}
              className={`mt-1.5 animate-pop text-xs font-semibold [animation-duration:250ms] ${reminded.ok ? 'text-emerald-700' : 'text-amber-700'}`}
              data-shift-reminded={reminded.ok ? 'ok' : 'error'}
            >
              {reminded.ok ? `✓ ${reminded.ok}` : reminded.error}
            </p>
          )}
        </div>
      )}
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
