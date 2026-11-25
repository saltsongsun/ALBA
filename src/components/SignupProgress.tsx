'use client'

import { useEffect, useRef, useState } from 'react'

const REQUIRED: [name: string, label: string][] = [
  ['photo', '사진'],
  ['name', '이름'],
  ['rrn2', '주민번호'],
  ['phone', '휴대폰'],
  ['pin2', '비밀번호'],
  ['agree_privacy', '개인정보 동의'],
  ['agree_third', '제3자 제공 동의'],
  ['agree_rrn', '주민번호 동의'],
]

/** 두 칸으로 나뉜 항목은 앞 칸부터 (주민번호 앞자리 → 뒷자리, 비밀번호 → 확인) */
const FIRST: Record<string, string> = { rrn2: 'rrn1', pin2: 'pin' }

/** 가입 화면 위에 붙어 있는 진행률: 필수 칸을 얼마나 채웠는지 (다 채우면 초록). '다음: ○○'를 누르면 그 칸으로 */
export default function SignupProgress({ required = REQUIRED }: { required?: [name: string, label: string][] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(0)
  const [next, setNext] = useState<string | null>(required[0][1])
  const [nextName, setNextName] = useState<string | null>(required[0][0])
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    // 화면에 보이는 차례대로 (예전엔 목록 차례라 위에 있는 '이름'이 비어도 '다음: 사진'이 먼저 떴음 — 정기 개선 2026-11-25 08:35)
    const at = (n: string) => {
      const el = form.elements.namedItem(FIRST[n] ?? n)
      return el instanceof RadioNodeList ? (el[0] as Element | undefined) : (el as Element | null)
    }
    const onScreen = (a: string, b: string) => {
      const x = at(a), y = at(b)
      if (!x || !y) return x ? -1 : y ? 1 : 0
      return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    }
    const check = () => {
      const fd = new FormData(form)
      const left = required
        .filter(([n]) => {
          const v = fd.get(n)
          return !v || (typeof v === 'string' && !v.trim())
        })
        .sort(([a], [b]) => onScreen(a, b))
      setDone(required.length - left.length)
      setNext(left[0]?.[1] ?? null)
      setNextName(left[0]?.[0] ?? null)
    }
    check()
    form.addEventListener('input', check)
    form.addEventListener('change', check)
    const t = setInterval(check, 1500) // 사진처럼 화면 밖에서 채워지는 칸도 반영
    return () => {
      form.removeEventListener('input', check)
      form.removeEventListener('change', check)
      clearInterval(t)
    }
  }, [])
  const pct = Math.round((done / required.length) * 100)

  // 빠진 칸으로 바로: 화면 가운데로 옮기고 글자 칸이면 커서를 놓음, 사진처럼 숨은 칸은 그 자리를 잠깐 반짝
  const jump = () => {
    const form = ref.current?.closest('form')
    if (!form || !nextName) return
    const pick = (n: string) => form.elements.namedItem(n) as HTMLInputElement | null
    const first = FIRST[nextName] && pick(FIRST[nextName])
    const el = first && !first.value.trim() ? first : pick(nextName)
    if (!el) return
    const box = el.type === 'hidden' ? el.parentElement : el
    if (!box) return
    let still = false
    try {
      still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {}
    box.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
    if (el.type !== 'hidden') el.focus({ preventScroll: true })
    if (!still) box.animate([{ boxShadow: '0 0 0 0 rgba(37, 87, 232, 0.45)' }, { boxShadow: '0 0 0 12px rgba(37, 87, 232, 0)' }], { duration: 900, delay: 250, easing: 'ease-out' })
  }
  // 다 채웠으면 맨 아래 '가입하기' 버튼으로 (긴 가입 화면에서 아래까지 찾아 내리지 않게) · 도착하면 테두리 0.3초 한 번 — 정기 개선 2026-11-25 08:35
  const toSubmit = () => {
    const btn = [...(ref.current?.closest('form')?.querySelectorAll<HTMLButtonElement>('button[type=submit]') ?? [])].pop()
    if (!btn) return
    let still = false
    try {
      still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {}
    btn.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
    if (!still) btn.animate([{ boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.5)' }, { boxShadow: '0 0 0 10px rgba(16, 185, 129, 0)' }], { duration: 300, delay: 350, easing: 'ease-out' })
  }
  return (
    <div ref={ref} className="sticky top-14 z-10 rounded-xl bg-bg/95 px-3 py-2 backdrop-blur">
      <div className="flex items-center justify-between text-xs font-semibold">
        {done === required.length ? (
          <button type="button" onClick={toSubmit} className="inline-block min-w-0 animate-pop truncate text-left text-emerald-600 transition active:scale-95" data-signup-complete>
            ✓ 필수 항목을 모두 채웠어요 <span aria-hidden>↓</span>
          </button>
        ) : (
          <button type="button" onClick={jump} className="min-w-0 truncate text-left text-sub transition active:scale-95" data-next-field={nextName ?? ''}>
            {/* 다음 칸이 바뀌면 이름이 톡 (0.32초 · 동작 줄이기면 바로) — 하나 채우면 다음이 어디인지 눈에 띄게 */}
            필수 {done}/{required.length} · 다음:{' '}
            <span key={nextName ?? ''} className="inline-block animate-pop font-bold text-brand-600 underline decoration-brand-300 underline-offset-2" data-next-label>
              {next}
            </span>{' '}
            →
          </button>
        )}
        <span className="tabular-nums text-mute">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-[width,background-color,box-shadow] duration-300 ${done === required.length ? 'bg-emerald-500 shadow-[0_0_10px_rgb(16_185_129/0.6)]' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
