'use client'

import { useState } from 'react'
import { isBizNo } from '@/lib/validate'

type State = 'empty' | 'typing' | 'ok' | 'bad'
const stateOf = (v: string): State => {
  const n = v.replace(/\D/g, '').length
  if (n === 0) return 'empty'
  if (n < 10) return 'typing'
  return n === 10 && isBizNo(v) ? 'ok' : 'bad'
}

/**
 * 사업자등록번호 칸: 쓰는 대로 맞는 번호인지 바로 알려 줌 (끝자리 검증 숫자 · 국세청 계산법).
 * 잘못 친 번호가 근로계약서·임금명세서에 그대로 들어가지 않게 — 막지는 않고 안내만 (서버는 회사 가입 때만 막음)
 * digits: 숫자만 받기 (가입 화면) / 아니면 '000-00-00000'처럼 줄표도 됨 (설정·정보 고치기)
 * 쓰는 곳: 회사로 시작하기 · 회사 설정 · 외주 업체 가입 · 업체 정보 고치기 · 외주처 등록 · 회사 추가(최상위 관리자)
 */
export default function BizNoField({
  id = 'business_no',
  name = 'business_no',
  defaultValue = '',
  placeholder,
  required,
  digits,
  hint,
}: {
  id?: string
  /** 보내는 칸 이름 (회사·외주처: business_no · 외주 업체 회원·전문가: biz_no) */
  name?: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  digits?: boolean
  hint?: string
}) {
  const [state, setState] = useState<State>(stateOf(defaultValue))
  const [count, setCount] = useState(defaultValue.replace(/\D/g, '').length)
  return (
    <>
      <input
        id={id}
        name={name}
        className="input"
        inputMode="numeric"
        // 줄표 넣은 번호(000-00-00000)를 붙여 넣어도 잘리지 않게 12자까지 받고, 숫자만 남김
        maxLength={12}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        aria-describedby={`${id}-check`}
        data-biz={state}
        data-missing={state === 'bad' ? '' : undefined}
        onInput={(e) => {
          const el = e.currentTarget
          if (digits) el.value = el.value.replace(/\D/g, '').slice(0, 10)
          setState(stateOf(el.value))
          setCount(el.value.replace(/\D/g, '').length)
        }}
      />
      <p id={`${id}-check`} aria-live="polite" className={`hint mt-1 ${state === 'ok' ? 'font-semibold text-emerald-700' : state === 'bad' ? 'font-semibold text-amber-700' : ''}`}>
        {state === 'ok'
          ? '✓ 올바른 사업자등록번호예요'
          : state === 'bad'
            ? '번호를 다시 확인해 주세요 · 사업자등록증의 10자리와 달라요'
            : state === 'typing'
              ? `${count}/10자리`
              : hint}
      </p>
    </>
  )
}
