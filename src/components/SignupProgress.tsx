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
    const check = () => {
      const fd = new FormData(form)
      const left = required.filter(([n]) => {
        const v = fd.get(n)
        return !v || (typeof v === 'string' && !v.trim())
      })
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
  return (
    <div ref={ref} className="sticky top-14 z-10 rounded-xl bg-bg/95 px-3 py-2 backdrop-blur">
      <div className="flex items-center justify-between text-xs font-semibold">
        {done === required.length ? (
          <span className="inline-block animate-pop text-emerald-600" data-signup-complete>
            ✓ 필수 항목을 모두 채웠어요
          </span>
        ) : (
          <button type="button" onClick={jump} className="min-w-0 truncate text-left text-sub transition active:scale-95" data-next-field={nextName ?? ''}>
            필수 {done}/{required.length} · 다음: <span className="font-bold text-brand-600 underline decoration-brand-300 underline-offset-2">{next}</span> →
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
