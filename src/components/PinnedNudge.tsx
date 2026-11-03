'use client'

import { useActionState } from 'react'
import { nudgePinned } from '@/app/actions/room'
import { FormMessage, SubmitButton } from './ui'

/** 고정 공지를 아직 안 본 근무자에게만 다시 알림 */
export default function PinnedNudge({ jobId, count }: { jobId: string; count: number }) {
  const [state, action] = useActionState(nudgePinned.bind(null, jobId), null)
  return (
    <form action={action} className="space-y-1.5" data-pinned-nudge>
      {!state?.ok && (
        <SubmitButton className="btn-sm w-full bg-amber-500 text-white hover:bg-amber-600" pendingText="보내는 중…">
          🔔 안 본 {count}명에게 다시 알림
        </SubmitButton>
      )}
      <FormMessage state={state} />
    </form>
  )
}
