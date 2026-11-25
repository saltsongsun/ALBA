'use client'

import { useEffect, useState } from 'react'

/** 지원할 때 '한마디' 칸에 자주 쓰는 말을 눌러 넣기 (이미 있는 말은 다시 안 넣음) */
const PHRASES = ['행사 스태프 경험 있어요', '모든 날짜 가능해요', '일찍 도착할 수 있어요', '차량 있어요', '체력 자신 있어요', '처음이지만 열심히 할게요']
/** 전문가 의뢰: 회사가 고를 때 궁금한 것 (경험·장비·포트폴리오·리허설) */
const PRO_PHRASES = ['비슷한 행사 경험', '장비 지참 가능', '포트폴리오 있어요', '리허설 참여 가능', '모든 날짜 가능해요', '팀 구성 가능']

/** 칸에서 한 마디를 빼고 남은 쉼표·띄어쓰기 정리 ('a, b, c'에서 b → 'a, c') */
const without = (text: string, p: string) =>
  text
    .split(p)
    .join('')
    .replace(/\s*,\s*(,\s*)+/g, ', ')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .trim()

/**
 * 하루짜리 공고엔 '모든 날짜 가능해요'가 뜻이 없어서 뺌 (multiDay: 여러 날 행사일 때만)
 * · 넣은 말은 ✓로 바뀌고 한 번 더 누르면 빠짐 (칸을 직접 고쳐도 같이 맞춰짐)
 * · last: 내가 전에 지원할 때 쓴 한마디 — 눌러서 그대로 넣기 (휴대폰에서 다시 치지 않게)
 */
export default function MessageChips({ target, pro = false, multiDay = true, last = null }: { target: string; pro?: boolean; multiDay?: boolean; last?: string | null }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const el = document.getElementById(target) as HTMLInputElement | null
    if (!el) return
    const sync = () => setText(el.value)
    // 보낸 뒤 칸이 비워지면(form reset) ✓도 같이 풀림
    const later = () => setTimeout(sync, 0)
    sync()
    el.addEventListener('input', sync)
    el.form?.addEventListener('reset', later)
    return () => {
      el.removeEventListener('input', sync)
      el.form?.removeEventListener('reset', later)
    }
  }, [target])

  const put = (next: string) => {
    const el = document.getElementById(target) as HTMLInputElement | null
    if (!el) return
    el.value = next.slice(0, el.maxLength > 0 ? el.maxLength : 300)
    setText(el.value)
    // 칸을 직접 친 것처럼 알림 (날짜 고르기가 '모든 날짜 가능해요'를 보고 날짜를 맞춤 · 정기 개선 2026-11-25 21:35)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.focus()
  }
  const toggle = (p: string) => {
    const cur = text.trim()
    if (cur.includes(p)) put(without(cur, p))
    else put(cur ? `${cur}, ${p}` : p)
  }

  const lastMsg = last?.trim() || null
  const lastOn = !!lastMsg && text.includes(lastMsg)
  return (
    <>
      {lastMsg && (
        <button
          type="button"
          onClick={() => toggle(lastMsg)}
          aria-pressed={lastOn}
          className={`mt-2 flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] ring-1 transition duration-150 active:scale-[0.98] ${
            lastOn ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-sub ring-line hover:bg-bg'
          }`}
          data-last-message
        >
          <span key={String(lastOn)} className={`shrink-0 font-semibold ${lastOn ? 'animate-pop' : ''}`}>
            {lastOn ? '✓ 넣었어요' : '지난번에 쓴 말'}
          </span>
          <span className="min-w-0 truncate">{lastMsg}</span>
        </button>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(pro ? PRO_PHRASES : PHRASES)
          .filter((p) => multiDay || p !== '모든 날짜 가능해요')
          .map((p) => {
            const on = text.includes(p)
            return (
              // 넣으면 ✓로 바뀌며 살짝 튐 (key가 바뀌어 다시 그려짐 · 움직임 줄이기면 바로)
              <button
                key={`${p}-${on}`}
                type="button"
                onClick={() => toggle(p)}
                aria-pressed={on}
                className={`chip h-8 px-3 text-xs ${on ? 'animate-pop bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-50' : ''}`}
                data-phrase-chip
              >
                {on ? '✓ ' : '+ '}
                {p}
              </button>
            )
          })}
      </div>
    </>
  )
}
