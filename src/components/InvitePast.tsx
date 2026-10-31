'use client'

import { useActionState, useMemo, useState } from 'react'
import { inviteToJob } from '@/app/actions/chat'
import Avatar from './Avatar'
import Fold from './Fold'
import { GroupContact } from './GroupContact'
import { FormMessage, keepInputs, SubmitButton } from './ui'

export type PastWorker = {
  id: string
  name: string
  phone: string
  photo_at: string | null
  days: number
  late: number
  noShow: number
  dismissed?: number
  avg: number | null
}

/** 예전에 일한 근무자를 골라 새 공고 모집을 앱 알림·단체 문자로 (노쇼 없는 사람을 기본으로 고름) */
export default function InvitePast({ jobId, jobTitle, link, workers }: { jobId: string; jobTitle: string; link: string; workers: PastWorker[] }) {
  const [state, action] = useActionState(inviteToJob.bind(null, jobId), null)
  const [onlyReliable, setOnlyReliable] = useState(true)
  const [picked, setPicked] = useState(() => new Set(workers.filter((w) => w.noShow === 0 && !w.dismissed).map((w) => w.id)))
  const reliable = workers.filter((w) => w.noShow === 0 && !w.dismissed).length
  const shown = useMemo(() => workers.filter((w) => !onlyReliable || (w.noShow === 0 && !w.dismissed)), [workers, onlyReliable])
  const chosen = shown.filter((w) => picked.has(w.id))
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allOn = chosen.length === shown.length

  return (
    <Fold title="📣 이전 근무자에게 모집 알리기" summary={`근무한 적 있는 ${workers.length}명 · 노쇼 없는 ${reliable}명`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-5 accent-brand-600" checked={onlyReliable} onChange={(e) => setOnlyReliable(e.target.checked)} />
          노쇼 없는 사람만
        </label>
        <button
          type="button"
          className="font-semibold text-brand-600"
          onClick={() => setPicked((s) => (allOn ? new Set([...s].filter((id) => !shown.some((w) => w.id === id))) : new Set([...s, ...shown.map((w) => w.id)])))}
        >
          {allOn ? '모두 해제' : '모두 선택'}
        </button>
      </div>
      <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl ring-1 ring-line">
        {shown.map((w) => (
          <li key={w.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
              <input type="checkbox" className="size-5 shrink-0 accent-brand-600" checked={picked.has(w.id)} onChange={() => toggle(w.id)} />
              <Avatar id={w.id} name={w.name} photoAt={w.photo_at} size="sm" zoom={false} />
              <span className="min-w-0 flex-1 truncate font-semibold">{w.name}</span>
              <span className="shrink-0 text-xs text-mute">
                근무 {w.days}일{w.avg != null && ` · ★${w.avg.toFixed(1)}`}
                {w.late > 0 && ` · 지각 ${w.late}`}
                {w.noShow > 0 && <b className="text-rose-600"> · 노쇼 {w.noShow}</b>}
                {!!w.dismissed && <b className="text-rose-600"> · 귀가 조치 {w.dismissed}</b>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <form action={action} onReset={keepInputs} className="space-y-2">
        {chosen.map((w) => (
          <input key={w.id} type="hidden" name="uid" value={w.id} />
        ))}
        <FormMessage state={state} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton className="btn-primary btn-sm" pendingText="보내는 중…">
            앱으로 알리기 ({chosen.length}명)
          </SubmitButton>
          <GroupContact
            copy={false}
            className="btn-soft btn-sm"
            phones={chosen.map((w) => w.phone)}
            label={`문자로 보내기 (${chosen.length}명)`}
            body={`[${jobTitle}] 새 모집이 열렸어요! 지원하기: ${link}`}
          />
        </div>
      </form>
      <p className="hint">앱 알림은 근무자 &lsquo;문의&rsquo;에 공고 링크와 함께 들어가요. 이미 지원한 사람은 빼고 보내요.</p>
    </Fold>
  )
}
