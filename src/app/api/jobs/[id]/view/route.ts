import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { ipKey, overLimit } from '@/lib/ratelimit'
import { getUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'
import { mergeGuestViews, recordView } from '@/lib/views'

const VID = 'hw_vid'
const VID_RE = /^[A-Za-z0-9_-]{16,40}$/

/**
 * 비회원 표시 쿠키에 서명 (보안 점검 2026-11-25): 서명이 없으면 쿠키 값을 바꿔 가며 보내 조회수를 끝없이 부풀릴 수 있었음.
 * 서명이 맞는 표시만 그대로 셈 · 서명 없는 예전 표시는 새 표시와 같이 한 곳(IP)에서 한 시간에 60번까지만 받아 서명해 줌 (예전 방문자는 같은 사람으로 이어짐)
 */
function vidSig(vid: string): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET 환경변수(32자 이상)가 필요합니다.')
  return createHmac('sha256', s).update(`vid:${vid}`).digest('base64url').slice(0, 22)
}
/** 서명이 맞으면 표시, 아니면 null */
function signedVid(value: string | undefined): string | null {
  const [vid, sig] = (value ?? '').split('.')
  if (!vid || !sig || !VID_RE.test(vid)) return null
  const want = Buffer.from(vidSig(vid))
  const got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got) ? vid : null
}

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
  if (user) {
    viewer = `u:${user.id}`
    // 로그인 전에 이 휴대폰으로 본 기록이 있으면 이 사람 기록으로 합치고, 표시 쿠키는 지움 (한 사람이 두 번 세지지 않게)
    const raw = jar.get(VID)?.value
    if (raw) {
      // 서명한 표시 또는 서명 전에 받은 예전 표시만 합침
      const vid = signedVid(raw) ?? (VID_RE.test(raw) ? raw : null)
      if (vid) await mergeGuestViews(vid, user.id).catch(() => 0)
      jar.delete(VID)
    }
  } else {
    const raw = jar.get(VID)?.value
    let vid = signedVid(raw)
    if (!vid) {
      if (await overLimit(await ipKey('view-new'), 60, 3600)) return new Response(null, { status: 204 })
      vid = raw && VID_RE.test(raw) ? raw : randomBytes(16).toString('base64url')
      jar.set(VID, `${vid}.${vidSig(vid)}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
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
