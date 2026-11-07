import { NextResponse, type NextRequest } from 'next/server'
import { safePath } from '@/lib/validate'
import { VIEW_COOKIE, VIEW_HOURS } from '@/lib/view'

/** 근무자 화면으로 바꾼 뒤 바로 갈 수 있는 곳 (내 근무·공고·서류) — 그 밖은 근무자 첫 화면 */
const WORKER_NEXT = /^\/(me|jobs|docs)(\/|\?|$)/

/**
 * 관리자 ↔ 근무자 화면 바꾸기: /api/view?to=worker(&next=/me) → 근무자 화면 (표시를 남김) · 그 밖 → 관리자 화면 (표시를 지움).
 * 표시는 화면 고르기용일 뿐 권한과는 무관 (관리자 화면은 언제나 관리자 확인을 따로 함)
 */
export function GET(req: NextRequest) {
  const worker = req.nextUrl.searchParams.get('to') === 'worker'
  const next = safePath(req.nextUrl.searchParams.get('next'), '/')
  // 상대 주소로 (프록시 뒤에서 req.url의 호스트가 실제 주소와 달라도 같은 사이트로) · 다른 사이트로는 못 감
  const dest = worker ? (WORKER_NEXT.test(next) ? next : '/') : '/admin'
  const res = new NextResponse(null, { status: 303, headers: { Location: dest, 'Cache-Control': 'no-store' } })
  if (worker) {
    res.cookies.set(VIEW_COOKIE, 'worker', { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: VIEW_HOURS * 3600 })
  } else {
    res.cookies.delete(VIEW_COOKIE)
  }
  return res
}
