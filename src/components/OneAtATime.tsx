'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * 안에 있는 여러 폼 중 하나를 보내면, 끝날 때까지 나머지 줄은 흐리게 하고 누를 수 없게 함
 * (예: 새 공고 화면 '내 다른 회사 공고로 시작' — 여러 줄을 연달아 눌러 공고가 겹으로 생기지 않게).
 * 보낸 줄은 그대로 진하게 남아 '가져오는 중…'이 보임. 결과로 주소가 바뀌거나(안내 ?m=) 10초가 지나면 다시 풀림.
 * 흐려지는 것은 0.2초 (움직임 줄이기면 바로 · 전역 설정)
 */
export default function OneAtATime({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [sending, setSending] = useState<Element | null>(null)
  const sp = useSearchParams()
  const key = sp.toString()
  // 결과 안내로 돌아오면(주소 바뀜) 풀기
  useEffect(() => {
    setSending((el) => {
      el?.removeAttribute('data-sending')
      return null
    })
  }, [key])
  useEffect(() => {
    if (!sending) return
    const t = setTimeout(() => {
      sending.removeAttribute('data-sending')
      setSending(null)
    }, 10000)
    return () => clearTimeout(t)
  }, [sending])
  return (
    <div
      className={className}
      data-one-busy={sending ? '' : undefined}
      onSubmitCapture={(e) => {
        if (sending) {
          e.preventDefault()
          return
        }
        const form = e.target as HTMLElement
        form.setAttribute('data-sending', '')
        setSending(form)
      }}
    >
      {children}
    </div>
  )
}
