'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * 대화를 열면 서버가 '읽음'으로 바꾸지만, 화면 위·아래의 문의 숫자(공통 틀)는 그보다 먼저 그려져 그대로 남음.
 * 열자마자 한 번 새로 고쳐 숫자를 맞추고, 이 대화의 휴대폰 알림(알림 창에 남은 것)도 지움.
 * tag: 알림을 보낼 때 붙인 tag (예: chat-회사id, chat-근무자id, room-공고id)
 */
export default function ReadSync({ tag }: { tag?: string }) {
  const router = useRouter()
  useEffect(() => {
    const t = setTimeout(() => router.refresh(), 400)
    if (tag && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.getNotifications({ tag }))
        .then((list) => list?.forEach((n) => n.close()))
        .catch(() => {})
    }
    return () => clearTimeout(t)
  }, [router, tag])
  return null
}
