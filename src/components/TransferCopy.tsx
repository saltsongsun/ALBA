'use client'

import { useState, useTransition } from 'react'
import { transferList } from '@/app/actions/admin'

/** 정산: 미지급자 이체 목록(은행·계좌·예금주·금액)을 복사해 은행 앱·엑셀에 붙여 넣기 */
export default function TransferCopy({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const run = () =>
    start(async () => {
      const r = await transferList(jobId)
      if (!r.ok) return setMsg(r.error ?? '복사하지 못했어요.')
      try {
        await navigator.clipboard.writeText(r.ok)
        setMsg(`${r.n}명 이체 목록을 복사했어요`)
      } catch {
        setMsg('복사 권한이 없어요. 다시 눌러 주세요.')
      }
      setTimeout(() => setMsg(null), 3000)
    })
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={run} disabled={pending} className="btn-gray btn-sm disabled:opacity-60">
        {pending ? '불러오는 중…' : '💸 이체 목록 복사'}
      </button>
      {msg && <span role="status" className="text-xs font-semibold text-sub">{msg}</span>}
    </span>
  )
}
