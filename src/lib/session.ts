import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { db } from './db'
import type { Role } from './types'

const COOKIE = 'alba_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30일

export type SessionUser = {
  id: string
  role: Role
  name: string
  phone: string
}

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET 환경변수(32자 이상)가 필요합니다.')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export async function createSession(userId: string, version: number) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const payload = Buffer.from(JSON.stringify({ u: userId, v: version, e: exp })).toString('base64url')
  const jar = await cookies()
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function destroySession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

function parse(value: string | undefined): { u: string; v: number } | null {
  if (!value) return null
  const [payload, sig] = value.split('.')
  if (!payload || !sig) return null
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data.u !== 'string' || typeof data.v !== 'number') return null
    if (typeof data.e !== 'number' || data.e < Date.now() / 1000) return null
    return { u: data.u, v: data.v }
  } catch {
    return null
  }
}

// 요청마다 한 번만 DB에서 확인 (탈퇴·비밀번호 초기화 시 즉시 로그아웃되도록)
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies()
  const parsed = parse(jar.get(COOKIE)?.value)
  if (!parsed) return null
  const { data } = await db()
    .from('users')
    .select('id, role, name, phone, active, session_version')
    .eq('id', parsed.u)
    .maybeSingle()
  if (!data || !data.active || data.session_version !== parsed.v) return null
  return { id: data.id, role: data.role, name: data.name, phone: data.phone }
})

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getUser()
  if (!user) redirect('/login' + (next ? `?next=${encodeURIComponent(next)}` : ''))
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getUser()
  if (!user) redirect('/login?next=/admin')
  if (user.role !== 'admin') redirect('/')
  return user
}

export async function clientInfo() {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || ''
  return { ip, ua: (h.get('user-agent') ?? '').slice(0, 300) }
}

/** 모집 문구·공유 링크에 넣을 사이트 주소 */
export async function siteOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
