'use client'

import { useRef, useState } from 'react'
import { logout } from '@/app/actions/auth'
import { removePushSubscription } from '@/app/actions/push'

/** 이 기기의 휴대폰 알림을 끔 (같은 휴대폰을 다른 사람이 쓸 때 내 알림이 계속 오지 않게) */
async function dropPush() {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager?.getSubscription()
  if (!sub) return
  await removePushSubscription(sub.endpoint).catch(() => {})
  await sub.unsubscribe().catch(() => false)
}

/** 로그아웃: 먼저 이 기기 알림을 끄고 (최대 2초) 로그아웃 */
export default function LogoutButton({ className }: { className: string }) {
  const done = useRef(false)
  const [busy, setBusy] = useState(false)
  return (
    <form
      action={logout}
      onSubmit={(e) => {
        if (done.current) return
        e.preventDefault()
        const form = e.currentTarget
        setBusy(true)
        // 쓰다 만 문의 글은 지움 (같은 휴대폰을 다음 사람이 쓸 때 보이지 않게)
        try {
          for (const k of Object.keys(sessionStorage)) if (k.startsWith('chat-draft:')) sessionStorage.removeItem(k)
        } catch {}
        Promise.race([dropPush(), new Promise((r) => setTimeout(r, 2000))])
          .catch(() => {})
          .finally(() => {
            done.current = true
            form.requestSubmit()
          })
      }}
    >
      <button className={className} disabled={busy}>
        로그아웃
      </button>
    </form>
  )
}
