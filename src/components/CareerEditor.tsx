'use client'

import { useState } from 'react'
import type { Career } from '@/lib/careers'

type Row = Career & { key: number }
let seq = 0

/** 경력 입력: 행사명·기간·역할을 한 줄씩 더하고 지움 (name="careers"로 JSON을 보냄) */
export default function CareerEditor({ initial = [] }: { initial?: Career[] }) {
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial : []).map((c) => ({ ...c, key: ++seq })))
  const set = (key: number, k: keyof Career, v: string) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)))
  const add = () => setRows((rs) => [...rs, { key: ++seq, event: '', period: '', role: '' }])
  const value = JSON.stringify(rows.map(({ event, period, role }) => ({ event, period, role })))
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-mute">행사 스태프로 일한 경험이 있으면 적어 주세요. 확정에 도움이 돼요.</p>}
      {rows.map((r, i) => (
        <div key={r.key} className="space-y-1.5 rounded-xl bg-bg p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-mute">경력 {i + 1}</span>
            <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-xs font-semibold text-rose-500">
              지우기
            </button>
          </div>
          <input className="input py-2 text-sm" value={r.event} onChange={(e) => set(r.key, 'event', e.target.value)} placeholder="행사명 (예: 부산국제영화제)" maxLength={60} />
          <div className="grid grid-cols-2 gap-1.5">
            <input className="input py-2 text-sm" value={r.period} onChange={(e) => set(r.key, 'period', e.target.value)} placeholder="기간 (예: 2025.10, 3일)" maxLength={30} />
            <input className="input py-2 text-sm" value={r.role} onChange={(e) => set(r.key, 'role', e.target.value)} placeholder="역할 (예: 안내·주차)" maxLength={40} />
          </div>
        </div>
      ))}
      {rows.length < 20 && (
        <button type="button" onClick={add} className="btn-gray btn-sm w-full">
          + 경력 추가
        </button>
      )}
      <input type="hidden" name="careers" value={value} />
    </div>
  )
}
