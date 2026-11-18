'use client'

import { useRef, useState } from 'react'

/** 긴 코드 한 번에 복사 (안 되면 아래 칸이 열리고 전체 선택됨 → 길게 눌러 복사) */
export default function CopyCode({ code, label = '코드 복사' }: { code: string; label?: string }) {
  const [done, setDone] = useState<'ok' | 'manual' | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setDone('ok')
    } catch {
      setDone('manual')
      requestAnimationFrame(() => box.current?.select())
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={copy} className="btn-primary w-full" data-copy-code>
        {done === 'ok' ? '✓ 복사했어요' : label}
      </button>
      {done === 'ok' && (
        <p className="animate-pop text-center text-xs font-semibold text-emerald-700" data-copy-done>
          Apps Script 편집기에 붙여 넣으세요
        </p>
      )}
      {done === 'manual' && (
        <textarea ref={box} readOnly value={code} rows={4} className="input w-full font-mono text-[11px]" aria-label="연결 코드" onFocus={(e) => e.currentTarget.select()} />
      )}
    </div>
  )
}
