'use client'

import { useActionState } from 'react'
import { inviteToJob } from '@/app/actions/chat'
import { FormMessage, SubmitButton } from './ui'

type Viewer = { id: string; name: string; seen: string; visits: number; live: boolean; applied: boolean }

/** 관리자만: 이 공고를 본 가입자. 보고도 지원하지 않은 사람에게 바로 모집 알림 */
export default function ViewerInvite({ jobId, viewers, canInvite }: { jobId: string; viewers: Viewer[]; canInvite: boolean }) {
  const [state, action] = useActionState(inviteToJob.bind(null, jobId), null)
  const notApplied = viewers.filter((v) => !v.applied)
  return (
    <details className="mt-2 rounded-xl bg-bg px-3.5 py-2.5 text-sm">
      <summary className="cursor-pointer font-semibold text-sub">
        본 가입자 {viewers.length}명 · 지원 안 함 {notApplied.length}명
      </summary>
      <ul className="mt-2 divide-y divide-line">
        {viewers.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 truncate">
              {v.live && <span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" aria-label="지금 보는 중" />}
              <b>{v.name}</b> <span className="text-xs text-mute">{v.seen}{v.visits > 1 ? ` · ${v.visits}번 봄` : ''}</span>
            </span>
            <span className={`badge shrink-0 ${v.applied ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-mute'}`}>{v.applied ? '지원함' : '안 함'}</span>
          </li>
        ))}
      </ul>
      {canInvite && notApplied.length > 0 && (
        <form action={action} className="mt-2 space-y-2">
          {notApplied.map((v) => (
            <input key={v.id} type="hidden" name="uid" value={v.id} />
          ))}
          <SubmitButton className="btn-soft btn-sm" pendingText="보내는 중…">
            보고 지원 안 한 {notApplied.length}명에게 모집 알리기
          </SubmitButton>
          <FormMessage state={state} />
        </form>
      )}
    </details>
  )
}
