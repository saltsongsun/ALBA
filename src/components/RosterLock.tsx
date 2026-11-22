'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'
import { lockRoster, unlockRoster } from '@/app/actions/roster'
import { FormMessage, SubmitButton } from './ui'
import Icon from './Icon'
import PinDots from './PinDots'

/** 근무자 명단 잠금 화면: 관리자 본인 로그인 비밀번호를 한 번 더 (10분 동안 열림) */
export default function RosterLock({ next, minutes }: { next: string; minutes: number }) {
  const [state, action] = useActionState(unlockRoster.bind(null, next), null)
  const pin = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  // 손으로 마지막(6번째) 숫자를 쓰면 잠깐 뒤 저절로 '명단 열기' (10분마다 여는 화면이라 한 번 덜 누르게)
  // · 그 사이 버튼을 눌렀거나 고쳐 쓰면 안 보냄 · 한 번에 붙여 넣은 값(자동 완성)은 버튼으로
  const [len, setLen] = useState(0)
  const prev = useRef(0)
  const sent = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    pin.current?.focus()
    // 틀렸으면 지우고 다시 입력하기 좋게
    if (state?.error && pin.current) pin.current.value = ''
    setLen(0)
    prev.current = 0
    sent.current = false
  }, [state])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const onPin = (e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget
    const digits = el.value.replace(/\D/g, '').slice(0, 6)
    if (digits !== el.value) el.value = digits
    const typedLast = prev.current === 5 && digits.length === 6
    prev.current = digits.length
    setLen(digits.length)
    if (timer.current) clearTimeout(timer.current)
    if (typedLast)
      timer.current = setTimeout(() => {
        if (!sent.current && pin.current?.value.length === 6) form.current?.requestSubmit()
      }, 350)
  }
  return (
    <div className="mx-auto max-w-sm pt-6" data-roster-lock>
      <div className="card animate-pop space-y-4 text-center">
        {/* 잠금 그림: 이모지 대신 선 아이콘 (휴대폰마다 모양이 다르지 않게 · 정기 개선 2026-11-22 14:35) */}
        <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-2xl text-brand-600" data-roster-lock-icon>
          <Icon name="lock" />
        </span>
        <div>
          <h1 className="text-xl font-extrabold">근무자 명단 잠금</h1>
          <p className="mt-1 text-sm text-sub">
            근무자 개인정보가 있어 한 번 더 확인해요.
            <br />
            로그인할 때 쓰는 비밀번호를 넣어 주세요.
          </p>
        </div>
        <form
          ref={form}
          action={action}
          onSubmit={() => {
            sent.current = true
          }}
          className="space-y-3 text-left"
          key={state?.error ? 'retry' : 'first'}
        >
          <div className="flex items-end justify-between gap-2">
            <label className="label" htmlFor="roster-pin">
              내 비밀번호 (숫자 6자리)
            </label>
            <PinDots n={len} />
          </div>
          <input
            ref={pin}
            onInput={onPin}
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
        {/* 두 문장을 한 줄씩 (360px에서 '묻지 / 않아요'처럼 말 중간에서 끊기지 않게 · 정기 개선 2026-11-23 08:35) */}
        <p className="text-xs text-mute" data-roster-note>
          <span className="block">한 번 열면 {minutes}분 동안 다시 묻지 않아요.</span>
          <span className="block">누가 언제 열었는지 기록돼요.</span>
        </p>
      </div>
    </div>
  )
}

/** 명단이 열려 있는 동안: 남은 시간 + 바로 잠그기
 * 아래 가는 줄 = 남은 시간 (열 때 가득 → 잠길 때 0 · 30초마다 0.3초에 걸쳐 줄어듦 · 움직임 줄이기면 바로) — 정기 개선 2026-11-22 14:35 */
export function RosterOpenBar({ seconds, total = 600 }: { seconds: number; total?: number }) {
  const router = useRouter()
  // 열어 둔 채로 두면 남은 시간이 그대로 멈춰 있고, 시간이 지나도 명단이 계속 보이던 것
  // → 30초마다 줄어들고, 0이 되면 화면을 새로 받아 잠금 화면으로 (잠금 자체는 서버가 그대로 확인)
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    const end = Date.now() + seconds * 1000
    const tick = () => {
      const s = Math.round((end - Date.now()) / 1000)
      setLeft(s)
      if (s <= 0) router.refresh()
    }
    const id = setInterval(tick, 30_000)
    const done = setTimeout(tick, Math.max(0, seconds * 1000 + 500))
    return () => {
      clearInterval(id)
      clearTimeout(done)
    }
  }, [seconds, router])
  const min = Math.max(1, Math.ceil(left / 60))
  const share = Math.max(0, Math.min(1, left / Math.max(1, total)))
  return (
    <form action={lockRoster} className="relative flex items-center justify-between gap-2 overflow-hidden rounded-xl bg-emerald-50 px-3.5 py-2 text-sm" data-roster-open data-roster-left={Math.max(0, left)}>
      <span className="truncate font-semibold text-emerald-800">
        <Icon name="unlock" className="text-emerald-600" /> 명단 열림 · {left <= 0 ? '곧 잠겨요' : `${min}분 뒤 잠김`}
      </span>
      <button type="submit" className="shrink-0 rounded-lg px-2 py-1 font-bold text-emerald-700 transition hover:bg-emerald-100 active:scale-95">
        지금 잠그기
      </button>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-100">
        <span className="block h-full rounded-r-full bg-emerald-500/70 transition-[width] duration-300 ease-out" style={{ width: `${(share * 100).toFixed(1)}%` }} data-roster-time-bar />
      </span>
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
