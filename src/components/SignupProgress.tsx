'use client'

import { useEffect, useRef, useState } from 'react'

const REQUIRED: [name: string, label: string][] = [
  ['photo', '사진'],
  ['name', '이름'],
  ['rrn2', '주민번호'],
  ['phone', '휴대폰'],
  ['pin2', '비밀번호'],
  ['agree_privacy', '개인정보 동의'],
  ['agree_rrn', '주민번호 동의'],
]

/** 가입 화면 위에 붙어 있는 진행률: 필수 칸을 얼마나 채웠는지 (다 채우면 초록) */
export default function SignupProgress() {
  const ref = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(0)
  const [next, setNext] = useState<string | null>(REQUIRED[0][1])
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const check = () => {
      const fd = new FormData(form)
      const left = REQUIRED.filter(([n]) => {
        const v = fd.get(n)
        return !v || (typeof v === 'string' && !v.trim())
      })
      setDone(REQUIRED.length - left.length)
      setNext(left[0]?.[1] ?? null)
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
  const pct = Math.round((done / REQUIRED.length) * 100)
  return (
    <div ref={ref} className="sticky top-14 z-10 rounded-xl bg-bg/95 px-3 py-2 backdrop-blur">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className={done === REQUIRED.length ? 'text-emerald-600' : 'text-sub'}>
          {done === REQUIRED.length ? '✓ 필수 항목을 모두 채웠어요' : `필수 ${done}/${REQUIRED.length} · 다음: ${next}`}
        </span>
        <span className="tabular-nums text-mute">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full transition-[width] duration-300 ${done === REQUIRED.length ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
