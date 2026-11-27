'use client'

// ✏️ 정기 개선 2026-11-27 03:36 (새 파일)
// 출퇴근 기록 고치기 칸: 시작보다 한참 일찍 찍힌 출근을 눌러서 시작 시각으로 바꿈
// · 입력칸 값만 바꾸고 저장은 원래 '저장' 버튼으로 (실수로 바로 저장되지 않게) · 바뀐 칸은 잠깐 테두리
// · 움직임은 0.25초 (움직임 줄이기면 globals.css 전체 규칙으로 바로)
// ✏️ 정기 개선 2026-11-27 11:36: 누르면 저장 버튼이 보이게 내려 주고 잠깐 테두리
import { useState } from 'react'

export default function EarlyFix({ name, value, label }: { name: string; value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`col-span-2 flex items-center gap-1.5 rounded-xl px-3 py-2 text-left text-xs font-semibold transition duration-150 active:scale-[0.98] sm:col-span-6 ${
        done ? 'animate-pop bg-emerald-50 text-emerald-700 [animation-duration:250ms]' : 'bg-sky-50 text-sky-800'
      }`}
      data-early-fix={done ? 'done' : 'ready'}
      onClick={(e) => {
        const input = e.currentTarget.form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)
        if (!input) return
        input.value = value
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        input.classList.add('ring-2', 'ring-emerald-300')
        setTimeout(() => input.classList.remove('ring-2', 'ring-emerald-300'), 900)
        setDone(true)
        // ✏️ 정기 개선 2026-11-27 11:36: '아래 저장을 눌러 주세요' — 저장 버튼이 화면 밖이면 부드럽게 보이게 + 잠깐 테두리 (알리기 줄이 그려진 뒤 · 움직임 줄이기면 바로)
        const form = e.currentTarget.form
        setTimeout(() => {
          const save = form?.querySelector<HTMLButtonElement>('button[type="submit"]')
          if (!save) return
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          // 화면 아래 탭 막대(약 80px)·위 머리말에 가려 있으면 가운데로 (이미 잘 보이면 그대로)
          const r = save.getBoundingClientRect()
          if (r.top < 72 || r.bottom > window.innerHeight - 96) save.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
          save.classList.add('ring-2', 'ring-emerald-300', 'ring-offset-2')
          save.setAttribute('data-save-hint', '')
          setTimeout(() => {
            save.classList.remove('ring-2', 'ring-emerald-300', 'ring-offset-2')
            save.removeAttribute('data-save-hint')
          }, 1200)
        }, 80)
      }}
    >
      {done ? (
        <>✓ 출근을 {label}로 바꿨어요 · 아래 저장을 눌러 주세요</>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">시작보다 일찍 찍혔어요</span>
          <span className="shrink-0 underline-offset-2">출근을 {label}로 맞추기 ›</span>
        </>
      )}
    </button>
  )
}
