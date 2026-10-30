import { db } from '@/lib/db'
import { getUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

/** 근무자 얼굴 사진: 관리자와 본인만. 주소의 ?v=(올린 시각)가 바뀔 때만 새로 받도록 오래 캐시 */
export async function GET(_: Request, ctx: RouteContext<'/photo/[id]'>) {
  const { id } = await ctx.params
  const user = await getUser()
  if (!user) return new Response(null, { status: 401 })
  if (!isUuid(id) || (user.role !== 'admin' && user.id !== id)) return new Response(null, { status: 404 })
  const { data } = await db().from('user_photos').select('data').eq('user_id', id).maybeSingle()
  if (!data) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(Buffer.from((data as { data: string }).data, 'base64')), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
