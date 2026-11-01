'use client'

import { useState } from 'react'

/**
 * 여러 날 행사 지원: 근무 가능한 날 고르기 + 모두 선택/해제 + 고른 날만큼 예상 금액 (세전).
 * 이미 지난 날은 고를 수 없음
 */
export default function ApplyDays({
  days,
  perDay,
}: {
  days: { value: string; label: string; past: boolean }[]
  /** 하루 예상 금액 (공고에서 금액을 보여 주게 했을 때만) */
  perDay: number | null
}) {
  const open = days.filter((d) => !d.past)
  const [picked, setPicked] = useState<string[]>(open.map((d) => d.value))
  const all = picked.length === open.length
  const toggle = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))
  return (
    <div>
      <input type="hidden" name="date_choice" value="1" />
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="label mb-0">근무 가능한 날짜</p>
        {open.length > 1 && (
          <button type="button" onClick={() => setPicked(all ? [] : open.map((d) => d.value))} className="text-sm font-semibold text-brand-600">
            {all ? '모두 해제' : '모두 선택'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {days.map((d) => (
          <label key={d.value} className={d.past ? 'opacity-40' : 'cursor-pointer'}>
            <input
              type="checkbox"
              name="dates"
              value={d.value}
              checked={picked.includes(d.value)}
              disabled={d.past}
              onChange={() => toggle(d.value)}
              className="peer sr-only"
            />
            <span className="inline-block rounded-xl border border-line px-3 py-2 text-sm font-semibold text-mute transition duration-150 select-none active:scale-95 peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700">
              {d.label}
              {d.past && ' (지남)'}
            </span>
          </label>
        ))}
      </div>
      <p className={`mt-2 text-sm ${picked.length ? 'text-sub' : 'font-semibold text-rose-600'}`}>
        {picked.length ? (
          <>
            <b className="text-ink">{picked.length}일</b> 선택
            {perDay != null && perDay > 0 && (
              <>
                {' '}
                · 약 <b className="text-brand-700 tabular-nums">{(perDay * picked.length).toLocaleString('ko-KR')}원</b>
                <span className="text-xs text-mute"> (세전 · 하루 {perDay.toLocaleString('ko-KR')}원)</span>
              </>
            )}
          </>
        ) : (
          '근무할 수 있는 날을 하나 이상 골라 주세요.'
        )}
      </p>
    </div>
  )
}
