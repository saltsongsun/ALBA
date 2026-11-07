import { NextResponse, type NextRequest } from 'next/server'
import { VIEW_COOKIE, VIEW_HOURS } from '@/lib/view'

/**
 * 관리자 ↔ 근무자 화면 바꾸기: /api/view?to=worker → 근무자 첫 화면 (표시를 남김) · 그 밖 → 관리자 화면 (표시를 지움).
 * 표시는 화면 고르기용일 뿐 권한과는 무관 (관리자 화면은 언제나 관리자 확인을 따로 함)
 */
export function GET(req: NextRequest) {
  const worker = req.nextUrl.searchParams.get('to') === 'worker'
  // 상대 주소로 (프록시 뒤에서 req.url의 호스트가 실제 주소와 달라도 같은 사이트로)
  const res = new NextResponse(null, { status: 303, headers: { Location: worker ? '/' : '/admin', 'Cache-Control': 'no-store' } })
  if (worker) {
    res.cookies.set(VIEW_COOKIE, 'worker', { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: VIEW_HOURS * 3600 })
  } else {
    res.cookies.delete(VIEW_COOKIE)
  }
  return res
}
