'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { bizNoTaken } from '@/app/actions/company'
import { isBizNo } from '@/lib/validate'

type State = 'empty' | 'typing' | 'ok' | 'bad'
const stateOf = (v: string): State => {
  const n = v.replace(/\D/g, '').length
  if (n === 0) return 'empty'
  if (n < 10) return 'typing'
  return n === 10 && isBizNo(v) ? 'ok' : 'bad'
}

/** 사업자등록증처럼 3-2-5로 끊어 보여 줌 (105-87-12345) · 숫자 10자리까지 */
export const bizNoDash = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 10)
  return d.length <= 3 ? d : d.length <= 5 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

/**
 * 사업자등록번호 칸: 쓰는 대로 맞는 번호인지 바로 알려 줌 (끝자리 검증 숫자 · 국세청 계산법).
 * 잘못 친 번호가 근로계약서·임금명세서에 그대로 들어가지 않게 — 막지는 않고 안내만 (서버는 회사 가입 때만 막음)
 * 숫자만 쳐도 사업자등록증처럼 줄표가 들어감 (105-87-12345 · 보던 자리에서 커서가 튀지 않게) — 서버는 숫자만 씀
 * checkTaken: 10자리가 맞으면 이미 해피워크를 쓰는 회사인지 바로 확인
 *   'signup' 회사로 시작하기 (있으면 '기존 회사에 합류'로) · 'others' 회사 설정 (우리 회사 빼고 다른 회사가 쓰는지) · 'super' 최고 관리자의 회사 만들기
 * 쓰는 곳: 회사로 시작하기 · 회사 설정 · 외주 업체 가입 · 업체 정보 고치기 · 외주처 등록 · 회사 추가(최상위 관리자)
 */
export default function BizNoField({
  id = 'business_no',
  name = 'business_no',
  defaultValue = '',
  placeholder,
  required,
  hint,
  checkTaken,
}: {
  id?: string
  /** 보내는 칸 이름 (회사·외주처: business_no · 외주 업체 회원·전문가: biz_no) */
  name?: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  hint?: string
  checkTaken?: 'signup' | 'others' | 'super'
}) {
  const [state, setState] = useState<State>(stateOf(defaultValue))
  const [count, setCount] = useState(defaultValue.replace(/\D/g, '').length)
  // 이미 쓰는 회사인지: 확인 중 · 새 회사 · 이미 있음 (마지막으로 친 번호의 답만 씀)
  const [taken, setTaken] = useState<null | 'checking' | 'free' | 'taken'>(null)
  const seq = useRef(0)
  const check = (v: string, next: State) => {
    const my = ++seq.current
    if (!checkTaken || next !== 'ok') return setTaken(null)
    setTaken('checking')
    bizNoTaken(v.replace(/\D/g, ''), checkTaken === 'others' ? 'others' : 'signup')
      .then((t) => seq.current === my && setTaken(t ? 'taken' : 'free'))
      .catch(() => seq.current === my && setTaken(null))
  }
  const isTaken = state === 'ok' && taken === 'taken'
  return (
    <>
      <input
        id={id}
        name={name}
        className="input"
        inputMode="numeric"
        // 줄표 2개 포함 12자 (붙여 넣은 번호도 숫자만 골라 다시 끊음)
        maxLength={12}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        aria-describedby={`${id}-check`}
        aria-invalid={isTaken || undefined}
        data-biz={state}
        data-taken={isTaken ? '' : undefined}
        data-missing={state === 'bad' || isTaken ? '' : undefined}
        onInput={(e) => {
          const el = e.currentTarget
          // 커서 앞 숫자 개수를 기억했다가 줄표를 넣은 뒤 같은 자리로 (가운데를 고쳐도 끝으로 튀지 않게)
          const caret = el.selectionStart ?? el.value.length
          const before = el.value.slice(0, caret).replace(/\D/g, '').length
          const v = bizNoDash(el.value)
          if (v !== el.value) {
            el.value = v
            let at = 0
            for (let seen = 0; at < v.length && seen < before; at++) if (/\d/.test(v[at])) seen++
            if (document.activeElement === el) el.setSelectionRange(at, at)
          }
          const next = stateOf(v)
          setState(next)
          setCount(v.replace(/\D/g, '').length)
          check(v, next)
        }}
      />
      <p
        id={`${id}-check`}
        aria-live="polite"
        data-biz-check={state === 'ok' ? (taken ?? 'ok') : state}
        className={`hint mt-1 ${isTaken ? 'font-semibold text-amber-700' : state === 'ok' ? 'font-semibold text-emerald-700' : state === 'bad' ? 'font-semibold text-amber-700' : ''}`}
      >
        {state === 'ok' ? (
          taken === 'checking' ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden />
              올바른 번호예요 · 이미 쓰는 회사인지 확인 중…
            </span>
          ) : taken === 'taken' ? (
            <span className="block animate-[pop_0.28s_var(--ease-spring)_both]">
              {checkTaken === 'others' ? (
                // 회사 설정: 남의 번호가 계약서·명세서에 들어가지 않게 (저장도 막힘)
                '다른 회사가 이미 쓰는 번호예요 · 다시 확인해 주세요'
              ) : checkTaken === 'super' ? (
                '이미 이 번호로 등록된 회사가 있어요 · 위 회사 목록에서 확인해 주세요'
              ) : (
                <>
                  이미 해피워크를 쓰는 회사예요. 대표 관리자에게 회사 코드를 받아 합류해 주세요.{' '}
                  <Link href="/start?tab=join" className="tap whitespace-nowrap text-brand-600 underline underline-offset-2" data-biz-join>
                    기존 회사에 합류 →
                  </Link>
                </>
              )}
            </span>
          ) : taken === 'free' ? (
            <span className="inline-block animate-[pop_0.28s_var(--ease-spring)_both]">
              {checkTaken === 'signup' ? '✓ 올바른 번호예요 · 새로 시작할 수 있어요' : '✓ 올바른 사업자등록번호예요'}
            </span>
          ) : (
            '✓ 올바른 사업자등록번호예요'
          )
        ) : state === 'bad' ? (
          '번호를 다시 확인해 주세요 · 사업자등록증의 10자리와 달라요'
        ) : state === 'typing' ? (
          `${count}/10자리`
        ) : (
          hint
        )}
      </p>
    </>
  )
}
