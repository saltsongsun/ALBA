'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 예금주가 본인 이름과 다르면 바로 아래 두 줄 (가족 이름·오타로 급여가 늦어지는 실수 막기).
 * 같은 form의 '예금주' 칸과 이름을 봄: ownName이 있으면 그 이름(내 정보), 없으면 form의 '이름' 칸(가입).
 * 띄어쓰기는 무시 · 예금주를 비워 두면(본인 이름으로 저장) 안 보임
 */
export default function HolderHint({ ownName }: { ownName?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [diff, setDiff] = useState(false)
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const norm = (s: string | undefined) => (s ?? '').replace(/\s+/g, '')
    const field = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value
    const check = () => {
      const holder = norm(field('account_holder'))
      const name = norm(ownName ?? field('name'))
      setDiff(holder.length >= 2 && name.length >= 2 && holder !== name)
    }
    check()
    form.addEventListener('input', check)
    return () => form.removeEventListener('input', check)
  }, [ownName])
  return (
    <span ref={ref} aria-live="polite" className="-mt-2 block empty:hidden">
      {diff && (
        <span className="block animate-pop rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900" data-holder-diff>
          <b className="block font-semibold">예금주가 본인 이름과 달라요</b>
          <span className="block">다른 사람 계좌면 지급이 늦어질 수 있어요</span>
        </span>
      )}
    </span>
  )
}
