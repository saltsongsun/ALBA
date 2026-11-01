import { db } from '@/lib/db'
import { getUser } from '@/lib/session'
import { adminSeesWorker } from '@/lib/company'
import { isUuid } from '@/lib/validate'

/** 근무자 얼굴 사진: 본인과, 그 근무자가 지원한 회사의 관리자만. 주소의 ?v=(올린 시각)가 바뀔 때만 새로 받도록 오래 캐시 */
export async function GET(_: Request, ctx: RouteContext<'/photo/[id]'>) {
  const { id } = await ctx.params
  const user = await getUser()
  if (!user) return new Response(null, { status: 401 })
  if (!isUuid(id) || (user.id !== id && !(await adminSeesWorker(user, id)))) return new Response(null, { status: 404 })
  const { data } = await db().from('user_photos').select('data').eq('user_id', id).maybeSingle()
  if (!data) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(Buffer.from((data as { data: string }).data, 'base64')), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
