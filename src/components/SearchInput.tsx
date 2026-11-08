'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'
import Icon from './Icon'

/**
 * 관리자 목록 검색 칸: 쓰는 대로 잠깐 멈추면(0.4초) 바로 찾음 — '찾기'를 매번 누르지 않아도 됨.
 * 같은 양식의 다른 칸(숨은 탭·선택 상자)도 함께 보냄 · 한글 조합 중에는 기다림 · 화면은 그 자리 그대로(맨 위로 안 올라감)
 */
export default function SearchInput({
  wrapClassName = 'min-w-0 flex-1',
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  /** 칸을 감싼 자리의 크기 (줄 안에서 얼마나 차지할지) */
  wrapClassName?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const last = useRef(String(props.defaultValue ?? ''))
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const go = (input: HTMLInputElement) => {
    const form = input.form
    if (!form) return
    const v = input.value.trim()
    if (v === last.current) return
    last.current = v
    const params = new URLSearchParams()
    for (const [k, val] of new FormData(form)) if (typeof val === 'string' && val.trim()) params.set(k, val.trim())
    const qs = params.toString()
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }
  const later = (input: HTMLInputElement) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => go(input), 400)
  }
  // 칸 안 왼쪽에 돋보기 (따로 '찾기' 버튼 없이 · 찾는 동안은 돋보기가 깜빡여 찾는 중인 걸 알림)
  return (
    <span className={`relative block ${wrapClassName}`}>
      <Icon
        name="search"
        className={`pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 transition-colors ${pending ? 'animate-pulse text-brand-500' : 'text-mute'}`}
      />
      <input
        {...props}
        className={`${className} w-full pl-9`}
        type="search"
        aria-busy={pending || undefined}
        data-live-search
        onInput={(e) => {
          if ((e.nativeEvent as InputEvent).isComposing) return
          later(e.currentTarget)
        }}
        onCompositionEnd={(e) => later(e.currentTarget)}
      />
    </span>
  )
}
