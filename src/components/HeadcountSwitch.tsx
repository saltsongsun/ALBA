'use client'

import { useState, useTransition } from 'react'
import { setHeadcountShown } from '@/app/actions/admin'

/**
 * 관리자 공고 화면 맨 위: '근무자에게 인원 보이기' 스위치 (기본 꺼짐 — 공고 고치기의 같은 칸과 같은 값).
 * 누르면 바로 바뀌고(손잡이 200ms 미끄러짐) 저장되면 '✓ 저장' · 못 하면 되돌리고 이유 한 줄
 */
export default function HeadcountSwitch({ jobId, initial }: { jobId: string; initial: boolean }) {
  const [shown, setShown] = useState(initial)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const toggle = () => {
    if (pending) return
    const next = !shown
    setShown(next)
    setNote(null)
    start(async () => {
      const r = await setHeadcountShown(jobId, next).catch(() => ({ error: '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.' }))
      if (r.error) {
        setShown(!next)
        setNote({ ok: false, text: r.error })
      } else setNote({ ok: true, text: '✓ 저장' })
    })
  }
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2" data-headcount-switch={shown ? 'on' : 'off'}>
      <button type="button" role="switch" aria-checked={shown} aria-busy={pending} onClick={toggle} className="-ml-1 flex min-h-9 items-center gap-2 rounded-lg px-1 text-sm">
        <span aria-hidden className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${shown ? 'bg-brand-600' : 'bg-line'}`}>
          <span className={`absolute top-0.5 size-4 rounded-full bg-[#fff] shadow transition-[left] duration-200 motion-reduce:transition-none ${shown ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
        <span className={shown ? 'font-semibold text-ink' : 'text-sub'}>근무자에게 인원 보이기</span>
      </button>
      {note && (
        <span key={note.text + String(shown)} role="status" className={`animate-pop text-xs font-semibold ${note.ok ? 'text-emerald-700' : 'text-rose-600'}`} data-headcount-note>
          {note.text}
        </span>
      )}
    </div>
  )
}
