'use server'

import { db, must } from '@/lib/db'
import { requireUser } from '@/lib/session'

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/
/** 브라우저 푸시 서비스 주소만 (다른 서버로 요청을 보내게 하지 못하게) */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/, /^android\.googleapis\.com$/]
function pushHostOk(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((r) => r.test(u.hostname))
  } catch {
    return false
  }
}

/** 이 기기로 휴대폰 알림 받기 등록 (같은 기기면 덮어씀) */
export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser()
  const endpoint = String(sub?.endpoint ?? '')
  const p256dh = String(sub?.keys?.p256dh ?? '')
  const auth = String(sub?.keys?.auth ?? '')
  if (!pushHostOk(endpoint) || endpoint.length > 1000 || !B64URL.test(p256dh) || p256dh.length > 200 || !B64URL.test(auth) || auth.length > 100) {
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

/** 알림 단계: 'all' 전체 알림 듣기 / 'min' 최소 알림 듣기 (나를 직접 부른 알림·중요 시스템 알림만) */
export async function setPushLevel(level: string): Promise<{ ok?: string; error?: string }> {
  const user = await requireUser()
  if (level !== 'all' && level !== 'min') return { error: '잘못된 요청입니다.' }
  const { error } = await db().from('users').update({ push_level: level }).eq('id', user.id)
  if (error) return { error: '저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }
  return { ok: level === 'min' ? '최소 알림만 받아요' : '모든 알림을 받아요' }
}

/** 내 알림 단계 (칸이 아직 없으면 전체) */
export async function myPushLevel(): Promise<'all' | 'min'> {
  const user = await requireUser()
  const { data, error } = await db().from('users').select('push_level').eq('id', user.id).maybeSingle()
  if (error) return 'all'
  return (data as { push_level?: string | null } | null)?.push_level === 'min' ? 'min' : 'all'
}
