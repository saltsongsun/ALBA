'use client'

import { useEffect } from 'react'

/** 커뮤니티를 본 시각을 기억 (아래 탭 '새 글' 점을 끄기 위해). 개인정보 없음 */
export default function CommunitySeen() {
  useEffect(() => {
    document.cookie = `cm_seen=${encodeURIComponent(new Date().toISOString())}; path=/; max-age=31536000; samesite=lax`
  }, [])
  return null
}
