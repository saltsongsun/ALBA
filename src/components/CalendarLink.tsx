'use client'

import { useEffect, useState } from 'react'
import Icon from './Icon'

/**
 * 휴대폰 달력에 넣기 (.ics). 누르면 잠깐 '✓ 달력 여는 중' — 파일이 열리는 데 시간이 걸려 눌렸는지 모르고
 * 여러 번 누르던 것 (2.5초 뒤 원래대로 · 움직임 줄이기면 튀지 않음)
 */
export default function CalendarLink({ href, className = 'chip h-8 px-3 text-xs', ...rest }: { href: string; className?: string } & Record<`data-${string}`, string | boolean | undefined>) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!on) return
    const t = window.setTimeout(() => setOn(false), 2500)
    return () => window.clearTimeout(t)
  }, [on])
  return (
    <a href={href} className={`${className} ${on ? 'text-emerald-700' : ''}`} onClick={() => setOn(true)} data-calendar-link={on ? 'on' : 'off'} {...rest}>
      {on ? (
        <span key="on" className="inline-flex animate-pop items-center gap-1 motion-reduce:animate-none" role="status">
          <Icon name="check" /> 달력 여는 중
        </span>
      ) : (
        <>
          <Icon name="calendar" /> 달력에 넣기
        </>
      )}
    </a>
  )
}
