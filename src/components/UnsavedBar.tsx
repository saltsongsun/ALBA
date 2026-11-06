'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** 폼에 쓴 값 (파일은 이름·크기만) — 처음과 같은지 비교용 */
function snap(form: HTMLFormElement): string {
  const out: string[] = []
  new FormData(form).forEach((v, k) => {
    if (k.startsWith('$ACTION')) return
    out.push(`${k}=${typeof v === 'string' ? v : `file:${v.name}:${v.size}`}`)
  })
  return out.join('\u0000')
}

/**
 * 저장하지 않은 변경 안내: 긴 폼을 고친 뒤 '저장'을 잊고 나가지 않게
 * - 값이 처음과 달라지면 아래 탭 위에 '저장하지 않은 변경이 있어요 · 저장' 바가 올라옴 (원래대로 되돌리면 사라짐)
 * - 그 상태에서 다른 화면으로 가는 링크를 누르면 한 번은 멈추고 '한 번 더 누르면 저장 없이 나가요' (두 번 누르면 나감)
 * - 저장이 끝나면(오류가 아니면) 지금 값을 새 기준으로
 * - 바에서 저장하면 같은 자리에 '✓ 저장했어요'가 잠깐 (위쪽을 보고 있어도 저장된 걸 알게)
 * state: 폼의 useActionState 결과 (바뀔 때마다 저장 결과로 봄)
 * bar=false: 저장 버튼이 이미 늘 보이는 폼(공고 등록·수정)은 바 없이 '나가기 전 한 번 멈춤'만
 */
export default function UnsavedBar({
  formId,
  state,
  bar = true,
  warnText = '저장하지 않았어요 · 한 번 더 누르면 나가요',
}: {
  formId: string
  state: { error?: string } | null
  bar?: boolean
  /** bar=false일 때 나가려 하면 보이는 말 (서명: '서명 제출 전이에요 · …') */
  warnText?: string
}) {
  const base = useRef<string | null>(null)
  const savingRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [warn, setWarn] = useState(false)
  const [done, setDone] = useState(false)
  const [mounted, setMounted] = useState(false)

  // 처음 열었을 때와 저장이 끝났을 때 기준을 다시 잡음 (오류면 그대로 두어 계속 안내)
  useEffect(() => {
    setMounted(true)
    const form = document.getElementById(formId) as HTMLFormElement | null
    const wasSaving = savingRef.current
    savingRef.current = false
    setSaving(false)
    if (!form) return
    if (!state?.error) {
      // 저장 뒤 폼이 다시 채워진 다음에 잼
      const t = window.setTimeout(() => {
        base.current = snap(form)
        setDirty(false)
      }, 0)
      // 저장이 끝났으면 잠깐 '✓ 저장했어요'
      let t2 = 0
      if (wasSaving && state && bar) {
        setDone(true)
        t2 = window.setTimeout(() => setDone(false), 1800)
      }
      return () => {
        window.clearTimeout(t)
        window.clearTimeout(t2)
      }
    }
  }, [formId, state, bar])

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const check = () => {
      if (base.current !== null) setDirty(snap(form) !== base.current)
    }
    const onSubmit = () => {
      savingRef.current = true
      setSaving(true)
      setDone(false)
    }
    form.addEventListener('input', check)
    form.addEventListener('change', check)
    form.addEventListener('submit', onSubmit)
    return () => {
      form.removeEventListener('input', check)
      form.removeEventListener('change', check)
      form.removeEventListener('submit', onSubmit)
    }
  }, [formId])

  // 바뀐 채로 다른 화면 링크를 누르면 한 번 멈춤 (4초 안에 한 번 더 누르면 나감)
  useEffect(() => {
    if (!dirty) {
      setWarn(false)
      return
    }
    let armedUntil = 0
    let t = 0
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, location.href)
      // 같은 화면 안의 칸으로 가는 링크(#seal 등)·전화·문자는 그대로
      if (url.origin !== location.origin || url.pathname === location.pathname) return
      if (Date.now() < armedUntil) return
      e.preventDefault()
      e.stopPropagation()
      armedUntil = Date.now() + 4000
      setWarn(true)
      navigator.vibrate?.(30)
      window.clearTimeout(t)
      t = window.setTimeout(() => setWarn(false), 4000)
    }
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.clearTimeout(t)
    }
  }, [dirty])

  if (!mounted) return null
  // 저장 끝: 같은 자리에 잠깐 체크
  if (done && !dirty)
    return createPortal(
      <div data-vv="pin" data-saved-toast role="status" className="no-print pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-space)+8px)] z-30 px-3 sm:bottom-4">
        <div className="glass mx-auto flex w-fit animate-slide-up items-center gap-2 rounded-full py-2.5 pr-4 pl-3 text-sm font-semibold text-emerald-700">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="check-draw" />
          </svg>
          저장했어요
        </div>
      </div>,
      document.body,
    )
  if (!dirty || (!bar && !warn)) return null
  // 저장 버튼이 따로 늘 보이는 폼: 나가려 할 때만 짧은 안내
  if (!bar)
    return createPortal(
      <div data-vv="pin" data-unsaved="warn" role="status" className="no-print pointer-events-none fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top)+10px)] z-30 px-3">
        <p className="glass mx-auto w-fit animate-shake rounded-full px-4 py-2.5 text-[13px] font-semibold text-amber-700">{warnText}</p>
      </div>,
      document.body,
    )
  return createPortal(
    <div
      data-vv="pin"
      data-unsaved={warn ? 'warn' : ''}
      role="status"
      className="no-print fixed inset-x-0 bottom-[calc(var(--tabbar-space)+8px)] z-30 px-3 sm:bottom-4"
    >
      <div key={warn ? 'warn' : 'calm'} className={`glass mx-auto flex max-w-md items-center gap-3 rounded-[22px] p-2 pl-4 ${warn ? 'animate-shake' : 'animate-slide-up'}`}>
        <p className={`min-w-0 flex-1 text-[13px] font-semibold ${warn || state?.error ? 'text-amber-700' : 'text-ink'}`}>
          {warn ? '한 번 더 누르면 저장 없이 나가요' : state?.error ? '저장하지 못했어요 · 칸을 확인해 주세요' : '저장하지 않은 변경이 있어요'}
        </p>
        <button type="submit" form={formId} className="btn-primary btn-sm shrink-0" disabled={saving} aria-busy={saving}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
