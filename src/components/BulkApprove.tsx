'use client'

import { useEffect, useState } from 'react'
import { ConfirmSubmit } from './ui'

export const BULK_FORM = 'bulk-approve'

/**
 * 지원자 탭: 고른 사람만 한 번에 확정. 카드의 체크칸은 form 속성으로 이 폼에 묶임 (카드 안 다른 폼과 겹치지 않게).
 * 고른 사람이 있을 때만 화면 아래에 붙어 나타나고, 두 번 눌러야 확정 (인원 초과·연소자 제한이면 그 내용으로 물어봄)
 */
export function BulkApproveBar({
  action,
  headcount,
  approved,
}: {
  action: (form: FormData) => Promise<void>
  headcount: number
  approved: number
}) {
  const [picked, setPicked] = useState({ n: 0, minors: 0 })
  useEffect(() => {
    const read = () => {
      const els = [...document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"]:checked`)]
      setPicked({ n: els.length, minors: els.filter((e) => e.dataset.minor === '1').length })
    }
    read()
    document.addEventListener('change', read)
    return () => document.removeEventListener('change', read)
  }, [])
  if (!picked.n) return null
  const total = approved + picked.n
  const confirmText = picked.minors
    ? `연소자 ${picked.minors}명 포함 · ${picked.n}명 확정?`
    : total > headcount
      ? `모집 ${headcount}명 → ${total}명 · 확정?`
      : `${picked.n}명 확정할까요?`
  return (
    <form id={BULK_FORM} action={action} className="sticky bottom-4 z-20 flex animate-pop items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl">
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-sm font-semibold">
          <b className="text-lg tabular-nums">{picked.n}</b>명 골랐어요
        </span>
        <span className={`block text-xs font-medium ${total > headcount ? 'text-amber-300' : 'opacity-70'}`}>
          확정 후 {total}/{headcount}명
        </span>
      </span>
      <button
        type="button"
        className="shrink-0 text-xs font-semibold opacity-80"
        onClick={() => {
          document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"]:checked`).forEach((e) => (e.checked = false))
          document.dispatchEvent(new Event('change'))
        }}
      >
        선택 해제
      </button>
      <ConfirmSubmit className="btn-primary btn-sm shrink-0" confirmText={confirmText}>
        선택 {picked.n}명 확정
      </ConfirmSubmit>
    </form>
  )
}
