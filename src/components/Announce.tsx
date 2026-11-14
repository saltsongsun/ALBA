'use client'

import Icon from '@/components/Icon'
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
  last = null,
}: {
  jobId: string
  jobTitle: string
  recipients: Recipient[]
  /** 여러 날 행사면 날짜별로 골라 보냄 */
  dates: { value: string; label: string }[]
  /** 마지막으로 보낸 공지 (언제 · 글) — 접힌 칸에 한 줄로, 펼치면 '지난 공지 불러오기' */
  last?: { body: string; when: string; recent: boolean } | null
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
    <Fold
      title={
        <span className="inline-flex items-center gap-1.5">
          <Icon name="megaphone" className="text-brand-600" /> 확정자에게 공지
        </span>
      }
      summary={
        last ? (
          // 마지막 공지를 접힌 채로도 (같은 공지를 또 보내지 않게) — 한 줄 · 넘치면 …
          <span data-last-notice={last.recent ? 'recent' : 'old'}>
            <b className={last.recent ? 'text-amber-700' : 'text-sub'}>마지막 공지 {last.when}</b> · {last.body.replace(/\s+/g, ' ')}
          </span>
        ) : (
          `확정 ${recipients.length}명에게 앱으로 한 번에 · 문자로도 보낼 수 있어요`
        )
      }>
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
        <div className="fade-x flex gap-1.5 overflow-x-auto pb-0.5">
          {/* 지난 공지를 고쳐서 다시 보낼 때 (처음부터 다시 쓰지 않게) */}
          {last && (
            <button
              type="button"
              data-reuse-notice
              className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-[13px] font-semibold text-brand-700 transition active:scale-95"
              onClick={() => {
                const el = bodyRef.current!
                el.value = last.body
                el.focus()
                // 입력칸이 한 번 퍼져 나가듯 반짝 (채워졌다는 표시 · 다시 눌러도 다시) — 움직임 줄이기면 없음
                el.removeAttribute('data-filled')
                void el.offsetWidth
                el.setAttribute('data-filled', '')
              }}
            >
              ↺ 지난 공지 불러오기
            </button>
          )}
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
          onAnimationEnd={(e) => e.currentTarget.removeAttribute('data-filled')}
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
