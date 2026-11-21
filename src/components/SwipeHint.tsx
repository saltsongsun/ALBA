'use client'

/**
 * 넓은 표 바로 위 '옆으로 밀면 …' 안내 (정기 개선 2026-11-22 02:35)
 * - 바로 다음 칸(표 카드)이 실제로 옆으로 넘칠 때만 보임 (넓은 화면·열이 적으면 숨김)
 * - 화살표가 두 번 살짝 밀려 '밀 수 있다'를 보여 줌 (0.3초 · 움직임 줄이기면 없음)
 * - 한 번 옆으로 밀면 안내는 0.2초에 걸쳐 접혀 사라짐 (이미 알았으니)
 * 예전엔 아래쪽 여백을 빼(-mb-1) 표 카드에 글자 아래가 가려졌던 것도 함께 고침
 */
import { useEffect, useRef, useState } from 'react'

export function SwipeHint({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'show' | 'none' | 'done'>('show')
  useEffect(() => {
    const next = ref.current?.nextElementSibling as HTMLElement | null
    const box = next?.matches('.overflow-x-auto') ? next : next?.querySelector<HTMLElement>('.overflow-x-auto')
    if (!box) return
    const fits = () => box.scrollWidth <= box.clientWidth + 1
    const sync = () => setState((s) => (s === 'done' ? s : fits() ? 'none' : 'show'))
    sync()
    const onScroll = () => {
      if (box.scrollLeft > 12) setState((s) => (s === 'show' ? 'done' : s))
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(box)
    return () => {
      box.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [])
  return (
    <div
      ref={ref}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${state === 'none' ? 'hidden' : state === 'done' ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'} ${className}`}
      aria-hidden={state !== 'show' || undefined}
      data-swipe-state={state}
    >
      <p className="overflow-hidden text-xs text-mute" data-swipe-hint>
        {children}{' '}
        <span aria-hidden className="inline-block animate-[nudge-x_0.3s_ease-in-out_0.4s_2]">
          →
        </span>
      </p>
    </div>
  )
}
