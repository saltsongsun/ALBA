import { db } from '@/lib/db'
import { getUser } from '@/lib/session'
import { adminSeesWorker } from '@/lib/company'
import { isUuid } from '@/lib/validate'

/**
 * 근무자 얼굴 사진: 본인과, 그 근무자가 지원한 회사의 관리자만.
 *
 * 빠르게 (사람 수십 명이 한꺼번에 볼 때 DB 줄 서기를 줄임):
 * - 주소의 ?v=(올린 시각)가 바뀔 때만 새 사진 → 휴대폰은 하루 동안 다시 받지 않음(immutable), 그 뒤엔 ETag로 '그대로예요'(304)만
 * - 서버 칸(인스턴스) 안에 사진 데이터와 '이 관리자가 이 사람 사진을 볼 수 있음'을 잠깐 기억 → 같은 사진을 또 부를 때 DB에 가지 않음
 *   (권한은 1분, 사진은 10분만 기억 · 권한이 없다는 결과는 기억하지 않음 · 버전이 바뀌면 다른 열쇠)
 */
const PHOTO_TTL = 10 * 60_000
const SEES_TTL = 60_000
const photos = new Map<string, { bytes: Uint8Array; until: number }>()
const sees = new Map<string, number>()
const trim = <K, V>(m: Map<K, V>, max: number) => {
  while (m.size > max) m.delete(m.keys().next().value as K)
}

export async function GET(req: Request, ctx: RouteContext<'/photo/[id]'>) {
  const { id } = await ctx.params
  const user = await getUser()
  if (!user) return new Response(null, { status: 401 })
  if (!isUuid(id)) return new Response(null, { status: 404 })
  const now = Date.now()
  if (user.id !== id) {
    const key = `${user.id}:${id}`
    if ((sees.get(key) ?? 0) < now) {
      if (!(await adminSeesWorker(user, id))) return new Response(null, { status: 404 })
      sees.set(key, now + SEES_TTL)
      trim(sees, 5000)
    }
  }
  const v = new URL(req.url).searchParams.get('v') ?? ''
  const versioned = /^\d{6,}$/.test(v)
  const etag = `"${id}-${versioned ? v : '0'}"`
  const headers = {
    'Content-Type': 'image/jpeg',
    // 버전이 붙은 주소는 내용이 바뀌지 않음 → 하루 동안 다시 묻지 않음 (본인·관리자 기기에만, 공용 캐시엔 안 남김)
    'Cache-Control': versioned ? 'private, max-age=86400, immutable' : 'private, max-age=300',
    ETag: etag,
  }
  if (versioned && req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })

  const key = `${id}:${versioned ? v : ''}`
  const hit = photos.get(key)
  let bytes = hit && hit.until > now ? hit.bytes : null
  if (!bytes) {
    const { data } = await db().from('user_photos').select('data').eq('user_id', id).maybeSingle()
    if (!data) return new Response(null, { status: 404 })
    bytes = new Uint8Array(Buffer.from((data as { data: string }).data, 'base64'))
    if (versioned) {
      photos.delete(key)
      photos.set(key, { bytes, until: now + PHOTO_TTL })
      trim(photos, 300)
    }
  }
  return new Response(bytes as BodyInit, { headers })
}
