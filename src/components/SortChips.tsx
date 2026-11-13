'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'

/**
 * 목록 정렬 칩 (공고 지원자 탭 등): 누르면 그 칩이 기다리지 않고 바로 켜지고,
 * 새 순서가 올 때까지 아래 목록(lib/sortDim의 SORT_DIM)을 살짝 흐리게 → 눌렸는지 헷갈려 두세 번 누르지 않게.
 * 주소만 바꿈 (뒤로 가기 기록을 쌓지 않음) · 새 탭 열기(Ctrl·⌘ 누르고 클릭)는 그대로 링크로.
 */
export default function SortChips({
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
  const [shown, setShown] = useOptimistic(value)
  return (
    <nav aria-label={label} className="peer fade-x flex gap-1.5 overflow-x-auto pb-1" data-sort-chips={shown} data-pending={pending ? '' : undefined}>
      {options.map((o) => {
        const on = shown === o.value
        return (
          <Link
            key={o.value}
            href={o.href}
            scroll={false}
            aria-current={on ? 'true' : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              if (on) return
              start(() => {
                setShown(o.value)
                router.replace(o.href, { scroll: false })
              })
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition duration-150 active:scale-95 ${
              on ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'
            }`}
          >
            {o.label}
          </Link>
        )
      })}
    </nav>
  )
}
