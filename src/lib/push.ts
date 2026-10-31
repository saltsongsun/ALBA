import 'server-only'
import { createECDH, hkdfSync } from 'node:crypto'
import webpush from 'web-push'
import { db, must } from './db'

// 휴대폰 알림(웹 푸시). 서명 키(VAPID)는 따로 비밀값을 두지 않고 SESSION_SECRET에서 매번 같은 값으로 만들어 씀
// (SESSION_SECRET을 바꾸면 기존 알림 등록은 다시 해야 함)
const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')

let keys: { publicKey: string; privateKey: string } | null = null
function vapidKeys() {
  if (keys) return keys
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) return null
  const seed = Buffer.from(hkdfSync('sha256', secret, 'socket-alba', 'web-push vapid p256', 32))
  // 곡선 범위 안의 개인키로 (1 ~ n-1)
  const d = (BigInt('0x' + seed.toString('hex')) % (P256_N - BigInt(1))) + BigInt(1)
  const priv = Buffer.from(d.toString(16).padStart(64, '0'), 'hex')
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(priv)
  keys = { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: priv.toString('base64url') }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://socketalba.vercel.app', keys.publicKey, keys.privateKey)
  return keys
}

/** 브라우저가 알림 등록할 때 쓰는 공개키 */
export function pushPublicKey(): string | null {
  return vapidKeys()?.publicKey ?? null
}

export type PushMessage = { title: string; body: string; url: string; tag?: string }

/** 여러 사람에게 알림. 실패해도 오류를 내지 않음 (알림은 덤). 없어진 기기 등록은 지움 */
export async function sendPush(userIds: string[], msg: PushMessage): Promise<void> {
  try {
    const ids = [...new Set(userIds)].filter(Boolean)
    if (!ids.length || !vapidKeys()) return
    const subs = must(await db().from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', ids)) as {
      id: string
      endpoint: string
      p256dh: string
      auth: string
    }[]
    const gone: string[] = []
    const payload = JSON.stringify({ ...msg, body: msg.body.slice(0, 300) })
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600 })
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) gone.push(s.id)
        }
      }),
    )
    if (gone.length) await db().from('push_subscriptions').delete().in('id', gone)
  } catch {
    // 알림 실패는 무시 (본래 작업은 이미 끝남)
  }
}

/** 관리자 전원 */
export async function adminIds(): Promise<string[]> {
  const { data } = await db().from('users').select('id').eq('role', 'admin').eq('active', true)
  return ((data ?? []) as { id: string }[]).map((u) => u.id)
}
