'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { announceToJob } from '@/app/actions/chat'
import Fold from './Fold'
import { GroupContact } from './GroupContact'
import { FormMessage, keepInputs, SubmitButton } from './ui'

export type Recipient = { phone: string; dates: string[] | null; position: string | null }

// 자주 쓰는 공지 첫머리 (누르면 입력칸에 채워짐)
const TEMPLATES = ['집결 장소·시간이 바뀌었어요: ', '내일 근무 잊지 마세요. 집결 ', '날씨 때문에 일정이 바뀌었어요: ', '준비물 안내: ']

/** 공고 확정자에게 한 번에 공지: 앱 문의함으로 보내고, 같은 내용을 문자로도 보낼 수 있게 */
export default function Announce({
  jobId,
  jobTitle,
  recipients,
  dates,
}: {
  jobId: string
  jobTitle: string
  recipients: Recipient[]
  /** 여러 날 행사면 날짜별로 골라 보냄 */
  dates: { value: string; label: string }[]
}) {
  const [state, action] = useActionState(announceToJob.bind(null, jobId), null)
  const [target, setTarget] = useState('all')
  const [sent, setSent] = useState<{ body: string; target: string } | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const lastBody = useRef('')

  const positions = [...new Set(recipients.map((r) => r.position).filter((p): p is string => !!p))]
  const pick = (t: string) =>
    recipients.filter((r) =>
      t === 'all' ? true : t.startsWith('date:') ? !r.dates || r.dates.includes(t.slice(5)) : (r.position ?? '') === t.slice(4),
    )

  // 보냈으면 입력칸을 비우고, 문자로도 보낼 수 있게 내용을 남겨 둠
  useEffect(() => {
    if (!state?.ok) return
    setSent({ body: lastBody.current, target })
    if (bodyRef.current) bodyRef.current.value = ''
  }, [state])

  return (
    <Fold title="📢 확정자에게 공지" summary={`확정 ${recipients.length}명에게 앱으로 한 번에 · 문자로도 보낼 수 있어요`}>
      <form
        action={action}
        onReset={keepInputs}
        onSubmit={() => {
          lastBody.current = bodyRef.current?.value.trim() ?? ''
        }}
        className="space-y-3"
      >
        <select name="target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="all">확정자 전체 {recipients.length}명</option>
          {dates.length > 1 &&
            dates.map((d) => (
              <option key={d.value} value={`date:${d.value}`}>
                {d.label} 근무자 {pick(`date:${d.value}`).length}명
              </option>
            ))}
          {positions.map((p) => (
            <option key={p} value={`pos:${p}`}>
              배치 {p} {pick(`pos:${p}`).length}명
            </option>
          ))}
        </select>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              className="shrink-0 rounded-full bg-bg px-3 py-1.5 text-[13px] font-semibold text-sub transition active:scale-95"
              onClick={() => {
                const el = bodyRef.current!
                el.value = t
                el.focus()
              }}
            >
              {t.replace(/[:\s]+$/, '')}
            </button>
          ))}
        </div>
        <textarea
          ref={bodyRef}
          name="body"
          rows={3}
          maxLength={2000}
          required
          className="input"
          placeholder="예) 내일 집결이 08:30 촉석문 앞 운영본부로 바뀌었어요."
        />
        <FormMessage state={state} />
        <SubmitButton className="btn-primary w-full" pendingText="보내는 중…">
          앱으로 보내기 ({pick(target).length}명)
        </SubmitButton>
      </form>
      {sent && (
        <div className="animate-pop rounded-xl bg-bg p-3 text-sm">
          <p className="mb-2 text-sub">앱을 잘 안 보는 사람도 있으니 같은 내용을 문자로도 보낼 수 있어요.</p>
          <GroupContact
            copy={false}
            className="btn-soft btn-sm"
            phones={pick(sent.target).map((r) => r.phone)}
            label={`같은 내용 문자로 보내기 (${pick(sent.target).length}명)`}
            body={`[${jobTitle}] ${sent.body}`}
          />
        </div>
      )}
    </Fold>
  )
}
