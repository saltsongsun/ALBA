'use client'

import { useEffect, useRef, useState } from 'react'
import LiveNumber from '@/components/LiveNumber'

/** 한마디 칩 '모든 날짜 가능해요' (MessageChips와 같은 말) */
const ALL_DAYS = '모든 날짜 가능해요'

/** 날짜 칩 여러 개를 짧게: '11/14(토), 11/15(일)' · 셋 넘으면 '11/14(토) 외 2일' */
function daysText(labels: string[]) {
  return labels.length > 2 ? `${labels[0]} 외 ${labels.length - 1}일` : labels.join(', ')
}

/** 금액이 바뀌면 이전 금액에서 새 금액까지 짧게(0.26초) 굴러감 · '움직임 줄이기'면 바로 (넓은 숫자라 커지는 효과 대신) */
function RollWon({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const now = useRef(value)
  useEffect(() => {
    const from = now.current
    if (from === value) return
    let reduce = false
    try {
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {}
    const set = (v: number) => {
      now.current = v
      setShown(v)
    }
    if (reduce) return set(value)
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 260)
      set(p < 1 ? Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))) : value)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <span className="tabular-nums" data-won={value}>
      {shown.toLocaleString('ko-KR')}
    </span>
  )
}

/**
 * 여러 날 행사 지원: 근무 가능한 날 고르기 + 모두 선택/해제 + 고른 날만큼 예상 금액 (세전).
 * 이미 지난 날은 고를 수 없음.
 * 다른 근무와 시간이 겹치는 날은 칩에 주황 점: 확정된 근무와 겹치면 처음부터 빼 두고, 그래도 고르면 바로 아래에 경고
 * (지원은 막지 않음 — 다른 근무를 취소할 수도 있어서) · 지원만 해 둔 공고와 겹치면 점과 안내만
 */
export default function ApplyDays({
  days,
  perDay,
}: {
  days: { value: string; label: string; past: boolean; busy?: 'approved' | 'applied' }[]
  /** 하루 예상 금액 (공고에서 금액을 보여 주게 했을 때만) */
  perDay: number | null
}) {
  const open = days.filter((d) => !d.past)
  const [picked, setPicked] = useState<string[]>(open.filter((d) => d.busy !== 'approved').map((d) => d.value))
  const all = picked.length === open.length
  // 한마디에 '모든 날짜 가능해요'가 있는지 (칩으로 넣거나 직접 쳐도) — 넣는 순간 고를 수 있는 날을 모두 고르고,
  // 그 뒤에 날짜를 빼면 한 줄로 알려 줌 (말과 고른 날이 어긋난 채 지원하지 않게 · 정기 개선 2026-11-25 21:35)
  const openKey = open.map((d) => d.value).join(',')
  const openRef = useRef(open.map((d) => d.value))
  useEffect(() => {
    openRef.current = openKey ? openKey.split(',') : []
  }, [openKey])
  const [saysAll, setSaysAll] = useState(false)
  useEffect(() => {
    const el = document.getElementById('message') as HTMLInputElement | null
    if (!el) return
    let before = el.value.includes(ALL_DAYS)
    setSaysAll(before)
    const on = () => {
      const now = el.value.includes(ALL_DAYS)
      if (now && !before) setPicked(openRef.current)
      before = now
      setSaysAll(now)
    }
    el.addEventListener('input', on)
    return () => el.removeEventListener('input', on)
  }, [])
  const toggle = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))
  const fixed = open.filter((d) => d.busy === 'approved')
  const fixedOn = fixed.filter((d) => picked.includes(d.value))
  const fixedOff = fixed.filter((d) => !picked.includes(d.value))
  const applied = open.filter((d) => d.busy === 'applied')
  return (
    <div>
      <input type="hidden" name="date_choice" value="1" />
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="label mb-0">근무 가능한 날짜</p>
        {open.length > 1 && (
          <button type="button" onClick={() => setPicked(all ? [] : open.map((d) => d.value))} className="tap text-sm font-semibold text-brand-600 transition active:scale-95" data-days-all>
            {all ? '모두 해제' : '모두 선택'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {days.map((d) => {
          const on = picked.includes(d.value)
          return (
            <label key={d.value} className={`relative ${d.past ? 'opacity-40' : 'cursor-pointer'}`} data-day={d.value} data-busy={d.busy}>
              <input
                type="checkbox"
                name="dates"
                value={d.value}
                checked={on}
                disabled={d.past}
                onChange={() => toggle(d.value)}
                className="peer sr-only"
              />
              <span
                className={`inline-flex items-center gap-0.5 rounded-xl border py-2 text-sm ${on ? 'pr-2.5 pl-2' : 'px-3'} font-semibold transition duration-150 select-none active:scale-95 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 ${
                  on ? (d.busy === 'approved' ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-brand-500 bg-brand-50 text-brand-700') : 'border-line text-mute'
                }`}
              >
                {/* 고른 날은 ✓가 톡 (칩이 살짝 넓어지며 골랐다는 걸 보여 줌) */}
                {on && (
                  <span aria-hidden className="animate-pop text-[11px]" data-day-check>
                    ✓
                  </span>
                )}
                {d.label}
                {d.past && ' (지남)'}
              </span>
              {d.busy && !d.past && (
                <span
                  aria-label={d.busy === 'approved' ? '확정된 다른 근무와 겹침' : '지원한 다른 공고와 겹침'}
                  className={`absolute -top-1 -right-1 size-2.5 rounded-full ring-2 ring-white ${d.busy === 'approved' ? 'bg-amber-500' : 'bg-amber-300'}`}
                  data-busy-dot
                />
              )}
            </label>
          )
        })}
      </div>
      {/* 한마디엔 '모든 날짜 가능해요'인데 일부만 고름: 한 줄 + '모두 고르기' (톡 · 움직임 줄이기면 바로) */}
      {saysAll && !all && picked.length > 0 && (
        <p className="mt-2 flex animate-pop items-center gap-2 text-xs font-semibold text-amber-800" data-says-all>
          <span className="min-w-0 flex-1">‘모든 날짜 가능’인데 {picked.length}일만 골랐어요</span>
          <button type="button" onClick={() => setPicked(open.map((d) => d.value))} className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 whitespace-nowrap text-amber-900 transition active:scale-95" data-says-all-fix>
            모두 고르기
          </button>
        </p>
      )}
      {/* 겹치는 날 안내: 한 줄씩 짧게 */}
      {(fixed.length > 0 || applied.length > 0) && (
        <div className="mt-2 space-y-0.5 text-xs" data-busy-note>
          {fixedOn.length > 0 && (
            <p key={fixedOn.length} className="animate-pop font-semibold text-amber-800" data-busy-warn>
              ⚠️ {daysText(fixedOn.map((d) => d.label))} 확정된 근무와 시간이 겹쳐요
            </p>
          )}
          {fixedOff.length > 0 && (
            <p className="text-amber-700" data-busy-off>
              <span className="mr-1 inline-block size-1.5 rounded-full bg-amber-500 align-middle" />
              {daysText(fixedOff.map((d) => d.label))} 확정된 근무가 있어 뺐어요
            </p>
          )}
          {applied.length > 0 && (
            <p className="text-sub" data-busy-applied>
              <span className="mr-1 inline-block size-1.5 rounded-full bg-amber-300 align-middle" />
              {daysText(applied.map((d) => d.label))} 다른 공고에 지원 중
            </p>
          )}
        </div>
      )}
      <p className={`mt-2 text-sm ${picked.length ? 'text-sub' : 'font-semibold text-rose-600'}`}>
        {picked.length ? (
          <>
            <b className="text-ink">
              <LiveNumber value={picked.length} />일
            </b>{' '}
            선택
            {perDay != null && perDay > 0 && (
              <>
                {' '}
                · 약{' '}
                <b className="text-brand-700">
                  <RollWon value={perDay * picked.length} />원
                </b>
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
