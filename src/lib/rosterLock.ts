import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/**
 * 근무자 명단 잠금 (보안): 근무자 목록·근무자 상세·명부 CSV는 관리자가 자기 로그인 비밀번호를 한 번 더 넣어야 열림.
 * 한 번 풀면 10분 동안 그 관리자에게만 열림 (서명한 쿠키, /admin 아래에서만 보냄). 다른 관리자가 같은 기기로 로그인하면 다시 잠김
 */
export const ROSTER_COOKIE = 'alba_roster'
export const ROSTER_MINUTES = 10

function sign(payload: string): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET 환경변수(32자 이상)가 필요합니다.')
  return createHmac('sha256', s).update(`roster:${payload}`).digest('base64url')
}

/** 지금부터 10분 동안 이 관리자에게 명단을 여는 표 */
export function rosterToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Math.floor(Date.now() / 1000) + ROSTER_MINUTES * 60 })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** 이 관리자가 명단 잠금을 풀었고 아직 10분이 안 지났으면 남은 초, 아니면 0 */
export async function rosterUnlockedFor(userId: string): Promise<number> {
  const value = (await cookies()).get(ROSTER_COOKIE)?.value
  if (!value) return 0
  const [payload, sig] = value.split('.')
  if (!payload || !sig) return 0
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 0
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (data.u !== userId || typeof data.e !== 'number') return 0
    return Math.max(0, Math.floor(data.e - Date.now() / 1000))
  } catch {
    return 0
  }
}

/** 잠금을 푼 뒤 돌아갈 곳: 명단 화면·명부 CSV만 (다른 곳으로 보내는 링크 악용 막기) */
export function rosterNext(next: unknown): string {
  const s = typeof next === 'string' ? next : ''
  return /^\/admin\/(workers(\/[0-9a-f-]{36})?(\?[\w%=&.-]*)?|export\/workers)$/.test(s) ? s : '/admin/workers'
}
