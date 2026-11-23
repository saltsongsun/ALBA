'use client'

import { useEffect, useState } from 'react'

const KEY = 'text-size'

/** 글자 크게 보기 (이 휴대폰에만 저장). 화면 전체 글자와 버튼이 조금 커짐 */
export default function TextSizeToggle() {
  const [big, setBig] = useState(false)
  useEffect(() => setBig(document.documentElement.dataset.text === 'lg'), [])
  const toggle = () => {
    const next = !big
    setBig(next)
    if (next) document.documentElement.dataset.text = 'lg'
    else delete document.documentElement.dataset.text
    try {
      if (next) localStorage.setItem(KEY, 'lg')
      else localStorage.removeItem(KEY)
    } catch {}
  }
  return (
    // 줄 전체 누름 반응 + 손잡이가 0.2초 스프링으로 미끄러짐 (움직임 줄이기면 바로 · 정기 개선 2026-11-23 14:35)
    <button type="button" role="switch" aria-checked={big} onClick={toggle} className="flex w-full items-center gap-3 text-left transition-transform active:scale-[0.99]" data-text-toggle>
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-bg text-lg font-extrabold">
        가
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">글자 크게 보기</span>
        {/* '보여 / 줘요'처럼 말 중간에 꺾이지 않게 짧게 · '(이 휴대폰에만)'은 붙여서 (어두운 화면과 같은 모양) */}
        <span className="block text-sm text-sub" data-text-toggle-desc>
          글자와 버튼이 커져요 <span className="whitespace-nowrap">(이 휴대폰에만)</span>
        </span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${big ? 'bg-brand-600' : 'bg-line'}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-[#fff] shadow transition-[left] duration-200 ease-[var(--ease-spring)] ${big ? 'left-[22px]' : 'left-0.5'}`} data-switch-knob />
      </span>
    </button>
  )
}
