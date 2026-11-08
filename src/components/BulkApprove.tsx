'use client'

import { useEffect, useRef, useState } from 'react'
import { ConfirmSubmit } from './ui'

export const BULK_FORM = 'bulk-approve'

// 화면에 보이는 체크칸만 (휴대폰 카드와 PC 표에 같은 사람이 두 번 있어서, 접힌 '더보기' 안은 빼고)
const shownBoxes = (form: string) =>
  [...document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${form}"]`)].filter((e) =>
    typeof e.checkVisibility === 'function' ? e.checkVisibility() : e.offsetParent !== null,
  )

/**
 * 고른 지원자를 한 번에 확정 / 미선발 (지원자 탭 · 대시보드). 카드의 체크칸은 form 속성으로 이 폼에 묶임 (카드 안 다른 폼과 겹치지 않게).
 * 고른 사람이 있을 때만 화면 아래에 붙어 나타나고, 두 번 눌러야 진행 (연소자·인원 초과·주휴 대상이면 그 내용으로 물어봄).
 * 체크칸의 data-warn: 한 번 더 물어볼 까닭 ('연소자' · '근무 겹침' · '주휴 대상'),
 * data-job · data-left: 여러 공고에 걸칠 때(대시보드) 공고와 남은 자리 → 고른 사람이 남은 자리보다 많으면 한 번 더
 */
export function BulkApproveBar({
  approve,
  reject,
  headcount,
  approved = 0,
  className = '',
}: {
  approve: (form: FormData) => Promise<void>
  reject: (form: FormData) => Promise<void>
  /** 한 공고일 때만: 확정 후 인원 / 모집 인원 */
  headcount?: number
  approved?: number
  className?: string
}) {
  const [picked, setPicked] = useState<{ n: number; warns: string[]; overJob: boolean }>({ n: 0, warns: [], overJob: false })
  useEffect(() => {
    const read = () => {
      const els = [...document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"]:checked`)]
      const jobs = new Map<string, { n: number; left: number }>()
      for (const e of els) {
        if (!e.dataset.job || e.dataset.left == null) continue
        const v = jobs.get(e.dataset.job) ?? { n: 0, left: Number(e.dataset.left) }
        v.n++
        jobs.set(e.dataset.job, v)
      }
      setPicked({ n: els.length, warns: els.map((e) => e.dataset.warn ?? '').filter(Boolean), overJob: [...jobs.values()].some((v) => v.n > v.left) })
    }
    read()
    document.addEventListener('change', read)
    return () => document.removeEventListener('change', read)
  }, [])
  if (!picked.n) return null
  const total = approved + picked.n
  const over = headcount != null && total > headcount
  const count = (w: string) => picked.warns.filter((x) => x === w).length
  // 연소자 → 다른 근무와 겹침 → 인원 초과 → 주휴 대상 순으로 먼저 물어봄 (휴대폰 한 줄에 들어가게 짧게)
  const confirmText = count('연소자')
    ? `연소자 ${count('연소자')}명 · 확정?`
    : count('근무 겹침')
      ? `근무 겹침 ${count('근무 겹침')}명 · 확정?`
      : picked.overJob
      ? '인원 넘는 공고 · 확정?'
      : over
        ? `모집 ${headcount}명 → ${total}명 · 확정?`
        : count('주휴 대상')
          ? `주휴 대상 ${count('주휴 대상')}명 · 확정?`
          : `${picked.n}명 확정할까요?`
  return (
    <form
      id={BULK_FORM}
      action={approve}
      className={`sticky bottom-[calc(var(--tabbar-space)+8px)] z-20 animate-pop space-y-2.5 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl sm:bottom-4 ${className}`}
      data-bulk-bar
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {/* 고른 수가 바뀌면 숫자가 톡 튐 */}
          <b key={picked.n} className="inline-block animate-pop text-lg tabular-nums" data-bulk-n>
            {picked.n}
          </b>
          명 골랐어요
          {headcount != null && (
            <span className={`ml-1.5 text-xs font-medium ${over ? 'text-amber-300' : 'opacity-70'}`} data-bulk-after>
              확정 후 {total}/{headcount}명
            </span>
          )}
        </p>
        <button
          type="button"
          className="shrink-0 px-1 py-1 text-xs font-semibold opacity-80"
          onClick={() => {
            document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"]:checked`).forEach((e) => (e.checked = false))
            document.dispatchEvent(new Event('change'))
          }}
        >
          선택 해제
        </button>
      </div>
      {/* 누른 쪽이 확인 문구로 길어지면 그쪽이 넓어짐 (한 줄 유지) */}
      <div className="flex gap-2">
        <ConfirmSubmit
          className="btn btn-sm flex-auto bg-white/15 text-white hover:bg-white/25"
          confirmText="미선발 알림 보낼까요?"
          formAction={reject}
          track="선택 미선발"
        >
          미선발 {picked.n}명
        </ConfirmSubmit>
        <ConfirmSubmit className="btn-primary btn-sm flex-auto" confirmText={confirmText} track="선택 확정">
          선택 {picked.n}명 확정
        </ConfirmSubmit>
      </div>
    </form>
  )
}

/** 보이는 칸을 한 번에 고르기 / 모두 풀기 (일부만 골랐으면 '-' 표시) · form: 어느 묶음 폼의 칸인지 */
export function PickAll({ label, form = BULK_FORM }: { label?: string; form?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'none' | 'some' | 'all'>('none')
  useEffect(() => {
    const read = () => {
      const b = shownBoxes(form)
      const k = b.filter((e) => e.checked).length
      setState(k === 0 ? 'none' : k === b.length ? 'all' : 'some')
    }
    read()
    document.addEventListener('change', read)
    window.addEventListener('resize', read)
    return () => {
      document.removeEventListener('change', read)
      window.removeEventListener('resize', read)
    }
  }, [form])
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <label
      className={`flex shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold text-sub ${label ? 'rounded-lg py-1 pl-1' : 'size-9 justify-center rounded-lg active:bg-bg'}`}
      aria-label={label ? undefined : '모두 고르기'}
      data-pick-all
    >
      {label && <span>{state === 'all' ? '모두 풀기' : label}</span>}
      <input
        ref={ref}
        type="checkbox"
        checked={state === 'all'}
        onChange={(e) => {
          const on = e.currentTarget.checked
          shownBoxes(form).forEach((b) => (b.checked = on))
          document.dispatchEvent(new Event('change'))
        }}
        className="size-5 accent-brand-600"
      />
    </label>
  )
}

/**
 * 고른 사람에게 한 가지 일을 한 번에 (예: 정산 탭 '선택 n명 지급 완료'). 체크칸은 form={formId}로 이 폼에 묶임.
 * 고른 사람이 있을 때만 아래에 붙어 나타나고 두 번 눌러야 진행. 문구의 {n}은 고른 수.
 * 체크칸의 data-warn이 있으면 확인 문구를 '{data-warn} k명 · {short}?'로 (예: '계좌 없음 1명 · 지급 완료?')
 */
export function PickBar({
  formId,
  action,
  label,
  confirm,
  short,
  className = '',
}: {
  formId: string
  action: (form: FormData) => Promise<void>
  /** 버튼 글자 (예: '선택 {n}명 지급 완료') */
  label: string
  /** 확인 문구 (예: '{n}명 지급 완료로 바꾸고 알릴까요?') */
  confirm: string
  /** 주의할 사람이 섞였을 때 확인 문구 뒤쪽 (예: '지급 완료') */
  short: string
  className?: string
}) {
  const [picked, setPicked] = useState<{ n: number; warns: string[] }>({ n: 0, warns: [] })
  useEffect(() => {
    const read = () => {
      const els = [...document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"]:checked`)]
      setPicked({ n: els.length, warns: els.map((e) => e.dataset.warn ?? '').filter(Boolean) })
    }
    read()
    document.addEventListener('change', read)
    return () => document.removeEventListener('change', read)
  }, [formId])
  if (!picked.n) return null
  const fill = (t: string) => t.replaceAll('{n}', String(picked.n))
  const warn = picked.warns[0]
  const confirmText = warn ? `${warn} ${picked.warns.filter((w) => w === warn).length}명 · ${short}?` : fill(confirm)
  return (
    <form
      id={formId}
      action={action}
      className={`sticky bottom-[calc(var(--tabbar-space)+8px)] z-20 flex animate-pop items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl sm:bottom-4 ${className}`}
      data-pick-bar={formId}
    >
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
        <b key={picked.n} className="inline-block animate-pop text-lg tabular-nums">
          {picked.n}
        </b>
        명
      </p>
      <button
        type="button"
        className="shrink-0 px-1 py-1 text-xs font-semibold opacity-80"
        onClick={() => {
          document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"]:checked`).forEach((e) => (e.checked = false))
          document.dispatchEvent(new Event('change'))
        }}
      >
        선택 해제
      </button>
      <ConfirmSubmit className="btn-primary btn-sm shrink-0" confirmText={confirmText}>
        {fill(label)}
      </ConfirmSubmit>
    </form>
  )
}
