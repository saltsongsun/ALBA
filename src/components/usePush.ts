'use client'

import { useEffect, useState } from 'react'
import { removePushSubscription, savePushSubscription } from '@/app/actions/push'
import { haptic } from './ui'

/**
 * 휴대폰 알림 상태와 켜기·끄기 (알림 줄·알림 켜기 권유 창이 함께 씀)
 * inapp: 카카오톡 등 앱 안 브라우저 (알림을 못 받으니 크롬·사파리로 열어야 함)
 */
export type PushState = 'loading' | 'unsupported' | 'inapp' | 'ios-install' | 'denied' | 'off' | 'on' | 'error'

const toKey = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export function usePush(publicKey: string | null) {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const ua = navigator.userAgent
      const ios = /iPhone|iPad|iPod/.test(ua)
      const inapp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|BAND\/|DaumApps|; wv\)/i.test(ua)
      const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
      if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState(inapp ? 'inapp' : ios && !standalone ? 'ios-install' : 'unsupported')
        return
      }
      if (Notification.permission === 'denied') return setState('denied')
      const reg = await navigator.serviceWorker.ready
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off')
    })().catch(() => setState('unsupported'))
  }, [publicKey])

  const turnOn = async (): Promise<boolean> => {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off')
        return false
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey!) })
      const j = sub.toJSON()
      const r = await savePushSubscription({ endpoint: j.endpoint!, keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth } })
      setState(r.error ? 'error' : 'on')
      if (!r.error) haptic(15)
      return !r.error
    } catch {
      setState('error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await removePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  return { state, busy, turnOn, turnOff }
}
