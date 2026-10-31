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
    <button type="button" role="switch" aria-checked={big} onClick={toggle} className="flex w-full items-center gap-3 text-left">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-bg text-lg font-extrabold">
        가
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">글자 크게 보기</span>
        <span className="block text-sm text-sub">글자와 버튼을 조금 크게 보여 줘요 (이 휴대폰에만)</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${big ? 'bg-brand-600' : 'bg-line'}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${big ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
