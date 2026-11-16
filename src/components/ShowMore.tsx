'use client'

import { useState } from 'react'

/**
 * 긴 목록의 나머지를 '더 보기 (n명)' 뒤에 둠 — 누르기 전에는 나머지를 아예 만들지 않음.
 * 큰 행사(지원자 수백 명)에서 확정·미선발 칸을 다 그리느라 화면이 굼떠지지 않게 (처음 몇십 명은 그대로 보임).
 * row: 표 안에 넣을 때 (버튼을 표 한 줄로 · cols는 표의 칸 수)
 */
export default function ShowMore({ n, label = '', row = false, cols = 1, children }: { n: number; label?: string; row?: boolean; cols?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (open) return <>{children}</>
  const button = (
    <button type="button" onClick={() => setOpen(true)} className={`btn-white ${row ? 'btn-sm' : 'w-full'}`} data-show-more>
      {label ? `${label} ` : ''}더 보기 ({n}명)
    </button>
  )
  return row ? (
    <tr>
      <td colSpan={cols}>{button}</td>
    </tr>
  ) : (
    button
  )
}
