'use client'

import { useState, useTransition } from 'react'
import { setPushLevel } from '@/app/actions/push'
import { haptic } from './ui'

const OPTIONS = [
  { id: 'all', label: '전체 알림 듣기', hint: '단체방·새 모집까지' },
  { id: 'min', label: '최소 알림 듣기', hint: '나를 부른 알림만' },
] as const

/**
 * 알림 단계 고르기: 전체 / 최소.
 * 최소: @언급·1:1 문의·답장·내 지원 결과·서명할 서류·근무 변경·급여 등 나에게 온 알림과 중요한 시스템 알림만
 */
export default function PushLevel({ initial, admin = false }: { initial: 'all' | 'min'; admin?: boolean }) {
  const [level, setLevel] = useState(initial)
  const [msg, setMsg] = useState('')
  const [pending, start] = useTransition()
  const pick = (next: 'all' | 'min') => {
    if (next === level || pending) return
    const prev = level
    setLevel(next)
    haptic(8)
    start(async () => {
      const r = await setPushLevel(next)
      if (r.error) {
        setLevel(prev)
        setMsg(r.error)
      } else setMsg(r.ok ?? '')
    })
  }
  return (
    <div className="space-y-2" data-push-level={level}>
      <p className="text-sm font-bold">알림 받는 정도</p>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="알림 받는 정도">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={level === o.id}
            onClick={() => pick(o.id)}
            data-level={o.id}
            className={`rounded-xl px-3 py-2 text-left ring-1 transition active:scale-[0.98] ${level === o.id ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-line'}`}
          >
            <span className={`block text-sm font-bold ${level === o.id ? 'text-brand-700' : 'text-ink'}`}>{o.label}</span>
            <span className="block truncate text-xs text-sub">{o.id === 'all' && admin ? '새 지원자까지 모두' : o.hint}</span>
          </button>
        ))}
      </div>
      {/* 안내가 없을 때는 줄을 차지하지 않게 (내 정보 화면이 길어지지 않게) */}
      <p className="text-xs text-mute empty:hidden" aria-live="polite">
        {msg || (level === 'min' ? (admin ? '단체방 일반 메시지·새 지원자 알림은 오지 않아요' : '단체방 일반 메시지·커뮤니티·새 모집·단체 공지는 오지 않아요') : '')}
      </p>
    </div>
  )
}
