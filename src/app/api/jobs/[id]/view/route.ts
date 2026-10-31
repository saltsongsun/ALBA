import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { ipKey, overLimit } from '@/lib/ratelimit'
import { getUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'
import { recordView } from '@/lib/views'

const VID = 'hw_vid'
const VID_RE = /^[A-Za-z0-9_-]{16,40}$/

/**
 * 공고 화면이 열려 있는 동안 보내는 신호 (처음 열 때 + 30초마다). 관리자 조회는 세지 않음.
 * 가입자는 계정으로, 아니면 브라우저 표시(쿠키)로 같은 사람을 한 번만 셈. 한 곳에서 새 방문자를 지나치게 만들면 세지 않음
 */
export async function POST(_: Request, ctx: RouteContext<'/api/jobs/[id]/view'>) {
  const { id } = await ctx.params
  if (!isUuid(id)) return new Response(null, { status: 404 })
  const user = await getUser()
  if (user?.role === 'admin') return new Response(null, { status: 204 })
  const jar = await cookies()
  let viewer: string
  if (user) viewer = `u:${user.id}`
  else {
    let vid = jar.get(VID)?.value
    if (!vid || !VID_RE.test(vid)) {
      if (await overLimit(await ipKey('view-new'), 60, 3600)) return new Response(null, { status: 204 })
      vid = randomBytes(16).toString('base64url')
      jar.set(VID, vid, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
    }
    viewer = `v:${vid}`
  }
  try {
    await recordView(id, viewer, user?.id ?? null)
  } catch {
    // 없는 공고 등: 조용히 무시
  }
  return new Response(null, { status: 204 })
}
