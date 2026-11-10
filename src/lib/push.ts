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
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || `https://${process.env.CANONICAL_HOST || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'socketalba.vercel.app'}`, keys.publicKey, keys.privateKey)
  return keys
}

/** 브라우저가 알림 등록할 때 쓰는 공개키 */
export function pushPublicKey(): string | null {
  return vapidKeys()?.publicKey ?? null
}

export type PushMessage = { title: string; body: string; url: string; tag?: string }

/**
 * '최소 알림 듣기'를 고른 사람은 빼고 (전체 알림만 받는 사람만).
 * 알림 단계 칸을 못 읽으면(예: DB 적용 전) 아무도 빼지 않음 — 알림이 엉뚱하게 끊기지 않게
 */
async function allLevelOnly(ids: string[]): Promise<string[]> {
  const minimal = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db().from('users').select('id, push_level').in('id', ids.slice(i, i + 100))
    if (error) return ids
    for (const r of (data ?? []) as { id: string; push_level?: string | null }[]) if (r.push_level === 'min') minimal.add(r.id)
  }
  return ids.filter((id) => !minimal.has(id))
}

/**
 * 여러 사람에게 알림. 실패해도 오류를 내지 않음 (알림은 덤). 없어진 기기 등록은 지움.
 * optional: 꼭 받을 필요는 없는 알림 (단체방 일반 메시지·커뮤니티·새 모집·단체 공지·새 지원자 등) → '최소 알림' 고른 사람에게는 안 보냄.
 * 나를 직접 부른 알림(@언급·1:1 답장·내 지원 결과·서명할 서류·근무 변경 등)과 중요 시스템 알림은 optional 없이 보냄
 */
export async function sendPush(userIds: string[], msg: PushMessage, opts: { optional?: boolean } = {}): Promise<void> {
  try {
    let ids = [...new Set(userIds)].filter(Boolean)
    if (!ids.length || !vapidKeys()) return
    if (opts.optional) ids = await allLevelOnly(ids)
    if (!ids.length) return
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

/** 그 회사 관리자 전원 (다른 회사 관리자에게는 알림이 가지 않음) */
export async function adminIds(companyId: string): Promise<string[]> {
  const { data } = await db().from('company_members').select('user_id').eq('company_id', companyId)
  const ids = ((data ?? []) as { user_id: string }[]).map((m) => m.user_id)
  if (!ids.length) return []
  const { data: users } = await db().from('users').select('id').in('id', ids).eq('role', 'admin').eq('active', true)
  return ((users ?? []) as { id: string }[]).map((u) => u.id)
}

/**
 * 그 회사 관리자 전원에게 알림. 여러 회사를 맡은 관리자에게는 제목 끝에 회사 이름을 붙임 ('💬 홍길동 문의 · ○○기획')
 * — 잠금 화면에서도 어느 회사 일인지 알 수 있게 (한 회사만 맡은 관리자에게는 예전 그대로 짧게).
 * 회사 수·이름을 못 읽어도 알림은 그대로 보냄
 */
export async function sendAdminPush(companyId: string, msg: PushMessage, opts: { optional?: boolean } = {}): Promise<void> {
  let ids: string[] = []
  try {
    ids = await adminIds(companyId)
    if (!ids.length) return
    const { data } = await db().from('company_members').select('user_id, company_id').in('user_id', ids)
    const seen = new Map<string, Set<string>>()
    for (const m of (data ?? []) as { user_id: string; company_id: string }[]) {
      if (!ids.includes(m.user_id)) continue
      if (!seen.has(m.user_id)) seen.set(m.user_id, new Set())
      seen.get(m.user_id)!.add(m.company_id)
    }
    const multi = ids.filter((id) => (seen.get(id)?.size ?? 0) > 1)
    const { data: co } = multi.length ? await db().from('companies').select('company_name').eq('id', companyId).maybeSingle() : { data: null }
    const name = ((co as { company_name?: string | null } | null)?.company_name ?? '').trim()
    if (!multi.length || !name) return sendPush(ids, msg, opts)
    await Promise.all([
      sendPush(ids.filter((id) => !multi.includes(id)), msg, opts),
      sendPush(multi, { ...msg, title: `${msg.title} · ${name}` }, opts),
    ])
  } catch {
    // 회사 이름을 붙이려다 실패해도 알림 자체는 보냄 (sendPush는 스스로 오류를 삼킴)
    if (ids.length) await sendPush(ids, msg, opts)
  }
}

/** 최고 관리자 (보안 경고 등 앱 전체 알림) */
export async function superAdminIds(): Promise<string[]> {
  const { data } = await db().from('users').select('id').eq('role', 'admin').eq('is_super', true).eq('active', true)
  return ((data ?? []) as { id: string }[]).map((u) => u.id)
}

/** 알림을 켠(이 앱 알림이 등록된 기기가 하나라도 있는) 사람 · 주소가 너무 길어지지 않게 100명씩 나눠 읽음 */
export async function pushEnabledIds(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)].filter(Boolean)
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
  const rows = await Promise.all(chunks.map((c) => db().from('push_subscriptions').select('user_id').in('user_id', c).then((r) => (r.data ?? []) as { user_id: string }[])))
  return new Set(rows.flat().map((r) => r.user_id).filter((id) => ids.includes(id)))
}
