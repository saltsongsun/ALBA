'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'
import type { FormState } from '@/app/actions/auth'
import { ConfirmSubmit, FormMessage } from './ui'

type Person = { uid: string; name: string; inText: string; outText: string | null; paid: boolean }

/**
 * 근로시간 일괄 조정 (사용자 요청 2026-11-07): 그날 근무 기록이 있는 사람을 골라 출근·종료 시각을 한 번에.
 * '근로조건대로'를 누르면 공고(그날 적용) 시간이 채워짐 · 빈 칸은 그대로 · 지급 완료한 기록은 못 고름 · 두 번 눌러야 저장
 */
export default function BulkAdjust({
  action,
  people,
  startText,
  endText,
  initialPicked,
  initialIn,
  backHref,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  people: Person[]
  startText: string
  endText: string
  /** ✏️ 정기 개선 2026-11-27 11:36: 정산 탭 '일찍 찍힌 출근 · 한 번에 고치기'로 왔을 때 미리 고른 사람 · 출근 칸 (지급 끝난 사람은 빼고) */
  initialPicked?: string[]
  initialIn?: string
  /** 고친 뒤 '정산 탭에서 보기 ›' (정산 탭에서 왔을 때만) */
  backHref?: string
}) {
  const [state, formAction] = useActionState(action, null)
  const can = people.filter((p) => !p.paid)
  const [picked, setPicked] = useState<Set<string>>(() => new Set((initialPicked ?? []).filter((u) => can.some((p) => p.uid === u))))
  const [inT, setIn] = useState(initialIn ?? '')
  const [outT, setOut] = useState('')
  // 저장되면 고른 것·시각을 비움 (화면은 새 기록으로 다시 그려짐)
  useEffect(() => {
    if (state?.ok) {
      setPicked(new Set())
      setIn('')
      setOut('')
    }
  }, [state])
  const all = can.length > 0 && can.every((p) => picked.has(p.uid))
  const toggle = (uid: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(uid)) n.delete(uid)
      else n.add(uid)
      return n
    })
  const n = picked.size
  return (
    <form action={formAction} className="space-y-3" data-bulk-adjust-form>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-sub">고칠 사람</p>
        <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setPicked(all ? new Set() : new Set(can.map((p) => p.uid)))} data-bulk-all>
          {all ? '모두 풀기' : `모두 고르기 (${can.length}명)`}
        </button>
      </div>
      <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl ring-1 ring-line">
        {people.map((p) => (
          <li key={p.uid}>
            <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${p.paid ? 'opacity-50' : 'cursor-pointer active:bg-bg'}`}>
              <input
                type="checkbox"
                name="uid"
                value={p.uid}
                checked={picked.has(p.uid)}
                onChange={() => toggle(p.uid)}
                disabled={p.paid}
                className="size-5 shrink-0 accent-brand-600"
              />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              <span className="shrink-0 text-xs text-sub tabular-nums">
                {p.paid ? '지급 완료' : `${p.inText} ~ ${p.outText ?? '근무 중'}`}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">출근</span>
          <input type="time" name="in_time" value={inT} onChange={(e) => setIn(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="label">종료</span>
          <input type="time" name="out_time" value={outT} onChange={(e) => setOut(e.target.value)} className="input" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="chip h-8 px-3 text-xs"
          onClick={() => {
            setIn(startText)
            setOut(endText)
          }}
          data-bulk-contract
        >
          근로조건대로 ({startText}~{endText})
        </button>
        <span className="text-xs text-mute">빈 칸은 그대로 둬요</span>
      </div>
      {/* ✏️ 정기 개선 2026-11-27 07:35: 시각이 실제로 바뀐 사람에게만 '🕒 근무 시각 고침 · 출근 06:00 → 09:00' (기본 켬 · 끄면 안 보냄) */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-sub transition-opacity duration-150 has-[input:not(:checked)]:opacity-60" data-bulk-tell>
        <input type="checkbox" name="tell" defaultChecked className="size-4 shrink-0 accent-emerald-600" />
        <span className="min-w-0">바뀐 시각을 근무자에게 알려요</span>
      </label>
      <FormMessage state={state} />
      {/* ✏️ 정기 개선 2026-11-27 11:36: 정산 탭에서 왔으면 고친 뒤 바로 돌아가 금액 확인 (0.25초 톡) */}
      {state?.ok && backHref && (
        <Link href={backHref} className="block animate-pop text-center text-sm font-bold text-brand-700 [animation-duration:250ms] active:scale-95" data-bulk-back>
          정산 탭에서 금액 보기 ›
        </Link>
      )}
      {/* ✏️ 정기 개선 2026-11-27 07:35: 저장되어 고른 사람이 0명이 되면 버튼을 처음 상태로 ('한 번 더 누르면 0명…'이 남지 않게) */}
      <ConfirmSubmit key={n === 0 ? 'none' : 'some'} className="btn-primary w-full" confirmText={`한 번 더 누르면 ${n}명 시간을 고쳐요`} disabled={n === 0 || (!inT && !outT)}>
        {n ? `고른 ${n}명 시간 고치기` : '고칠 사람을 골라 주세요'}
      </ConfirmSubmit>
    </form>
  )
}
