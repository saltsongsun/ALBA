'use client'

import { useEffect, useRef } from 'react'

/**
 * 계좌번호 칸 아래: 쓰는 대로 몇 자리인지 (숫자만 셈 · 10~16자리면 ✓).
 * 자리가 모자라거나 넘치면 입금 전에 알 수 있게 — 저장은 서버가 같은 기준으로 확인함.
 * 모자라다가 맞는 자리가 되는 순간 ✓ 줄이 한 번 톡 (다 썼다는 표시 · 처음 열 때·숫자마다는 아님 · '움직임 줄이기'면 안 움직임)
 */
export default function AccountDigits({ value, id, fallback }: { value: string; id?: string; fallback?: React.ReactNode }) {
  const n = value.replace(/\D/g, '').length
  const ok = n >= 10 && n <= 16
  const was = useRef<boolean | null>(null)
  const justOk = ok && was.current === false
  useEffect(() => {
    was.current = ok
  })
  if (n === 0) return fallback ? <p className="hint mt-1">{fallback}</p> : null
  return (
    <p
      id={id}
      aria-live="polite"
      data-account-digits={ok ? 'ok' : 'bad'}
      className={`hint mt-1 ${ok ? 'font-semibold text-emerald-700' : n > 16 ? 'font-semibold text-amber-700' : ''} ${justOk ? 'animate-pop' : ''}`}
    >
      {ok ? `✓ 계좌번호 ${n}자리` : n > 16 ? `${n}자리 · 너무 길어요 (숫자 10~16자리)` : `${n}자리 · 계좌번호는 숫자 10~16자리예요`}
    </p>
  )
}
