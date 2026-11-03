'use client'

import { useActionState, useEffect, useRef } from 'react'
import { lockRoster, unlockRoster } from '@/app/actions/roster'
import { FormMessage, SubmitButton } from './ui'

/** 근무자 명단 잠금 화면: 관리자 본인 로그인 비밀번호를 한 번 더 (10분 동안 열림) */
export default function RosterLock({ next, minutes }: { next: string; minutes: number }) {
  const [state, action] = useActionState(unlockRoster.bind(null, next), null)
  const pin = useRef<HTMLInputElement>(null)
  useEffect(() => {
    pin.current?.focus()
    // 틀렸으면 지우고 다시 입력하기 좋게
    if (state?.error && pin.current) pin.current.value = ''
  }, [state])
  return (
    <div className="mx-auto max-w-sm pt-6" data-roster-lock>
      <div className="card animate-pop space-y-4 text-center">
        <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-2xl">
          🔒
        </span>
        <div>
          <h1 className="text-xl font-extrabold">근무자 명단 잠금</h1>
          <p className="mt-1 text-sm text-sub">
            근무자 개인정보가 있어 한 번 더 확인해요.
            <br />
            로그인할 때 쓰는 비밀번호를 넣어 주세요.
          </p>
        </div>
        <form action={action} className="space-y-3 text-left" key={state?.error ? 'retry' : 'first'}>
          <label className="label" htmlFor="roster-pin">
            내 비밀번호 (숫자 6자리)
          </label>
          <input
            ref={pin}
            id="roster-pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            pattern="\d{6}"
            required
            className={`input text-center text-lg tracking-[0.5em] ${state?.error ? 'animate-shake ring-2 ring-rose-300' : ''}`}
          />
          <FormMessage state={state} />
          <SubmitButton className="btn-primary w-full py-3" pendingText="확인 중…">
            명단 열기
          </SubmitButton>
        </form>
        <p className="text-xs text-mute">한 번 열면 {minutes}분 동안 다시 묻지 않아요. 누가 언제 열었는지 기록돼요.</p>
      </div>
    </div>
  )
}

/** 명단이 열려 있는 동안: 남은 시간 + 바로 잠그기 */
export function RosterOpenBar({ seconds }: { seconds: number }) {
  const min = Math.max(1, Math.ceil(seconds / 60))
  return (
    <form action={lockRoster} className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-sm" data-roster-open>
      <span className="truncate font-semibold text-emerald-800">🔓 명단 열림 · {min}분 뒤 잠김</span>
      <button type="submit" className="shrink-0 rounded-lg px-2 py-1 font-bold text-emerald-700 transition hover:bg-emerald-100 active:scale-95">
        지금 잠그기
      </button>
    </form>
  )
}

/** 한 시간에 근무자 정보를 너무 많이 열었을 때 (명단 대량 수집 막기) */
export function RosterTooMany() {
  return (
    <div className="mx-auto max-w-sm pt-6" data-roster-too-many>
      <div className="card space-y-2 text-center">
        <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-rose-50 text-2xl">
          ✋
        </span>
        <h1 className="text-xl font-extrabold">잠시 쉬었다 열어 주세요</h1>
        <p className="text-sm text-sub">한 시간 동안 근무자 정보를 너무 많이 열었어요. 개인정보를 한꺼번에 가져가는 것을 막기 위해 잠시 막았어요. 한 시간 뒤에 다시 열 수 있어요.</p>
      </div>
    </div>
  )
}
