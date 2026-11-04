'use client'

import { useState } from 'react'

/**
 * 아래 탭을 누른 순간 표시(밑 동그라미·색)부터 그 탭으로 옮김. 새 화면이 다 그려질 때까지 기다리지 않음.
 * 화면이 실제로 바뀌면 그 주소 기준으로 돌아감 (누른 뒤 주소가 그대로면 계속 누른 탭 표시)
 */
export function useTabTarget(path: string) {
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null)
  const shown = pending && pending.from === path ? pending.href : path
  const onTap = (href: string) => (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    setPending({ href, from: path })
  }
  return [shown, onTap] as const
}
