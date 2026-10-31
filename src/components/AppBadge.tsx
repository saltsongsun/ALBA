'use client'

import { useEffect } from 'react'

/** 홈 화면에 설치한 앱 아이콘에 숫자 배지 (안 읽은 문의·할 일). 지원하는 휴대폰에서만 */
export default function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (!nav.setAppBadge) return
    ;(count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.())?.catch(() => {})
  }, [count])
  return null
}
