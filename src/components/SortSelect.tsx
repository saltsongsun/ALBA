'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

/**
 * 목록 정렬 고르기 (근무자 명단 등): 휴대폰 기본 선택 창으로 고르고, 고르면 바로 그 순서로 다시 그림.
 * 주소는 서버가 미리 만들어 줌 (검색어·거르기는 그대로 두고 정렬만 바꿈) · 바꾸는 동안 살짝 흐리게
 */
export default function SortSelect({
  value,
  options,
  label = '정렬',
}: {
  value: string
  options: { value: string; label: string; href: string }[]
  label?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <label className={`relative inline-flex shrink-0 items-center transition-opacity duration-150 ${pending ? 'opacity-60' : ''}`} data-sort-select={value}>
      <span className="sr-only">{label}</span>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 size-3.5 text-sub" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
      </svg>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => {
          const href = options.find((o) => o.value === e.target.value)?.href
          if (href) start(() => router.replace(href, { scroll: false }))
        }}
        className="h-8 appearance-none rounded-full bg-white py-0 pr-7 pl-7 text-[13px] font-semibold text-ink ring-1 ring-line outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 size-3 text-sub" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  )
}
