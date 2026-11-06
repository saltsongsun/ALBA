'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

export type JobTool = { href: string; icon: IconName; label: string; tone?: 'rose' }

/** 같은 모양의 칸 (아이콘 위 · 글자 아래) */
const TILE = 'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-bg px-1 py-2.5 text-xs font-semibold text-sub transition active:scale-95 hover:text-ink'

/**
 * 관리자 공고 화면의 도구 줄 (사용자 요청 2026-11-07 "여기 너무 지저분하다 디자인 정리해줘").
 * 단체방·시간 변경·긴급 QR·더보기를 같은 크기 칸 한 줄로 · 더보기를 누르면 칸 아래에 자주 안 쓰는 것(복사·모집·행사 취소·삭제)
 */
export default function JobTools({ tools, more }: { tools: JobTool[]; more: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-job-more data-open={open ? 'open' : undefined}>
      <div className="grid auto-cols-fr grid-flow-col gap-2" data-job-tools>
        {tools.map((t) => (
          <Link key={t.label} href={t.href} className={TILE}>
            <Icon name={t.icon} className={`text-lg ${t.tone === 'rose' ? 'text-rose-500' : 'text-ink'}`} />
            <span className="max-w-full truncate">{t.label}</span>
          </Link>
        ))}
        <button type="button" className={`${TILE} ${open ? 'text-ink ring-1 ring-line' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-more-toggle>
          <Icon name="more" className="text-lg text-ink" />
          <span>더보기</span>
        </button>
      </div>
      {/* 접혀 있을 때는 자리도 차지하지 않게 (안의 버튼도 보이지 않음) */}
      <div hidden={!open} className="mt-2 animate-pop" data-more-panel>
        {more}
      </div>
    </div>
  )
}
