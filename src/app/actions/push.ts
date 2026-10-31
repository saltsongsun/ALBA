'use server'

import { db, must } from '@/lib/db'
import { requireUser } from '@/lib/session'

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/

/** 이 기기로 휴대폰 알림 받기 등록 (같은 기기면 덮어씀) */
export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser()
  const endpoint = String(sub?.endpoint ?? '')
  const p256dh = String(sub?.keys?.p256dh ?? '')
  const auth = String(sub?.keys?.auth ?? '')
  if (!endpoint.startsWith('https://') || endpoint.length > 1000 || !B64URL.test(p256dh) || p256dh.length > 200 || !B64URL.test(auth) || auth.length > 100) {
    return { error: '알림을 켜지 못했어요.' }
  }
  must(await db().from('push_subscriptions').upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' }))
  return { ok: true }
}

/** 이 기기 알림 끄기 */
export async function removePushSubscription(endpoint: string) {
  const user = await requireUser()
  await db().from('push_subscriptions').delete().eq('endpoint', String(endpoint).slice(0, 1000)).eq('user_id', user.id)
}
