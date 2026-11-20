'use client'

import { useEffect, useState } from 'react'
import type { Fortune as F } from '@/lib/playContent'
import { haptic } from '@/components/ui'

const KEY = 'play-fortune-open'

/**
 * 오늘의 운세 (놀이터 · 재미용): 카드를 누르면 뒤집혀 열림 · 하루 동안 같은 결과 · 그날 연 카드는 다시 와도 열린 채로.
 * 뒤집기 0.3초 (움직임 줄이기면 전체 규칙으로 바로 열림)
 */
export default function Fortune({ f, date }: { f: F; date: string }) {
  const [open, setOpen] = useState(false)
  const [instant, setInstant] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === date) {
        setInstant(true)
        setOpen(true)
      }
    } catch {}
  }, [date])
  const flip = () => {
    if (open) return
    haptic(10)
    setInstant(false)
    setOpen(true)
    try {
      localStorage.setItem(KEY, date)
    } catch {}
  }
  const face = 'col-start-1 row-start-1 rounded-[22px] [backface-visibility:hidden]'
  return (
    <section aria-label="오늘의 운세" className="[perspective:900px]" data-fortune data-open={open ? '1' : '0'}>
      <button
        type="button"
        onClick={flip}
        aria-expanded={open}
        aria-label={open ? '오늘의 운세' : '오늘의 운세 열기'}
        className={`grid w-full text-left [transform-style:preserve-3d] ${instant ? '' : 'transition-transform duration-300 ease-out'} ${open ? '[transform:rotateY(180deg)] cursor-default' : 'active:scale-[0.98]'}`}
      >
        {/* 앞면: 아직 안 연 카드 */}
        <div className={`${face} flex items-center gap-3 bg-[linear-gradient(135deg,#6366f1,#8b5cf6)] px-4 py-4 text-white shadow-card`} aria-hidden={open}>
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15 text-2xl">
            🔮
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px]">오늘의 운세</b>
            <span className="block text-xs text-white/80">눌러서 오늘 한마디를 열어 보세요</span>
          </span>
          <span className="shrink-0 rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold">열기</span>
        </div>
        {/* 뒷면: 오늘의 결과 */}
        <div className={`${face} [transform:rotateY(180deg)] bg-white px-4 py-3.5 shadow-card ring-1 ring-black/[0.03]`} aria-hidden={!open} data-fortune-back>
          <p className="flex items-center gap-2 text-xs font-semibold text-mute">
            <span>🔮 오늘의 운세</span>
            <span className="ml-auto tracking-[0.15em] text-amber-500" aria-label={`별 ${f.stars}개`} data-fortune-stars>
              {'★'.repeat(f.stars)}
              <span className="text-line">{'★'.repeat(5 - f.stars)}</span>
            </span>
          </p>
          <p className="mt-1.5 text-[15px] font-bold break-keep text-balance text-ink" data-fortune-text>
            {f.text}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-sub">
            <span>
              행운 물건 <b className="text-ink">{f.item}</b>
            </span>
            <span>
              행운 시간 <b className="text-ink tabular-nums">{f.hour}시</b>
            </span>
          </p>
        </div>
      </button>
    </section>
  )
}
