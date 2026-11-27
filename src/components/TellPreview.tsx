'use client'

// ✏️ 정기 개선 2026-11-27 07:35 (새 파일)
// 출퇴근 기록 고치기 칸: 출근·퇴근 칸을 바꾸면 저장 버튼 위에 '근무자에게 알리기 · 출근 06:00 → 09:00'이 짧게 떠오름
// · 체크(기본 켬)된 채 저장하면 그 근무자 문의함에 같은 말이 감 (서버가 저장한 값으로 다시 만들어 보냄)
// · 시각이 그대로면 안 보임 (메모·추가지급만 고칠 때는 알림 없음) · 움직임 0.25초 (움직임 줄이기면 globals.css 전체 규칙으로 바로)
import { useEffect, useRef, useState } from 'react'
import { timeFixText } from '@/lib/timefix'

export default function TellPreview({
  nowIn,
  nowOut,
  appIn,
  appOut,
}: {
  /** 지금 화면에 보이는 시각 (고친 값이 있으면 그 값) 'HH:MM' */
  nowIn: string
  nowOut: string | null
  /** 앱 원래 기록 — 칸을 비우고 저장하면 서버가 이 값으로 되돌림 */
  appIn: string
  appOut: string | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const read = () => {
      const v = (n: string) => (form.querySelector<HTMLInputElement>(`input[name="${n}"]`)?.value ?? '').slice(11, 16)
      setText(timeFixText({ in: nowIn, out: nowOut }, { in: v('adj_in') || appIn, out: v('adj_out') || appOut }))
    }
    read()
    form.addEventListener('input', read)
    form.addEventListener('change', read)
    return () => {
      form.removeEventListener('input', read)
      form.removeEventListener('change', read)
    }
  }, [nowIn, nowOut, appIn, appOut])
  return (
    <div ref={ref} className={text ? 'col-span-2 sm:col-span-6' : 'hidden'} data-tell-preview={text ? 'on' : 'off'}>
      {text && (
        <label className="flex animate-pop cursor-pointer items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900 transition-opacity duration-150 [animation-duration:250ms] has-[input:not(:checked)]:opacity-55">
          <input type="checkbox" name="tell" defaultChecked className="mt-px size-4 shrink-0 accent-emerald-600" />
          <span className="min-w-0 break-keep">
            <b>근무자에게 알리기</b> · <span data-tell-text>{text}</span>
          </span>
        </label>
      )}
    </div>
  )
}
