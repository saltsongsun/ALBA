import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { db } from './db'
import type { MemberType, Role } from './types'

const COOKIE = 'alba_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30일
// 관리자는 개인정보를 모두 볼 수 있으므로 더 짧게 (휴대폰을 잃어버려도 일주일 뒤엔 다시 로그인)
const ADMIN_MAX_AGE = 60 * 60 * 24 * 7

export type SessionUser = {
  id: string
  role: Role
  name: string
  phone: string
  /** 최고 관리자: 회사를 만들고 관리자를 초대, 모든 회사에 들어갈 수 있음 */
  isSuper: boolean
  /** 가입 유형: 아르바이트 / 전문가 / 외주 업체 (화면이 다름) */
  memberType: MemberType
}

/** 관리자가 들어갈 수 있는 회사 (role: 회사 관리자 구분, 최고 관리자는 소속이 아니어도 'super') */
/** verified: 최고 관리자가 확인한 회사 (직접 가입한 회사는 확인 전까지 해피워크 전체 회원 명단을 못 봄) */
export type AdminCompany = { id: string; name: string; role: 'owner' | 'admin' | 'super'; verified: boolean }

/** 관리자 + 지금 보고 있는 회사 */
export type AdminUser = SessionUser & { companyId: string; companyName: string; companyVerified: boolean; companies: AdminCompany[] }

/** 관리자가 지금 보고 있는 회사 (회사 id만 담음, 매 요청마다 소속을 다시 확인) */
export const COMPANY_COOKIE = 'hw_company'

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET 환경변수(32자 이상)가 필요합니다.')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export async function createSession(userId: string, version: number, role: Role = 'worker') {
  const maxAge = role === 'admin' ? ADMIN_MAX_AGE : MAX_AGE
  const exp = Math.floor(Date.now() / 1000) + maxAge
  const payload = Buffer.from(JSON.stringify({ u: userId, v: version, e: exp })).toString('base64url')
  const jar = await cookies()
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
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
  const { data, error } = await db()
    .from('users')
    .select('id, role, name, phone, active, session_version, is_super, member_type')
    .eq('id', parsed.u)
    .maybeSingle()
  // DB에 닿지 않으면 로그아웃된 것처럼 보이지 않게 오류 화면으로 (오류 내용 복사 버튼)
  if (error) throw new Error(`로그인 확인 실패: ${error.message}`)
  if (!data || !data.active || data.session_version !== parsed.v) return null
  return {
    id: data.id,
    role: data.role,
    name: data.name,
    phone: data.phone,
    isSuper: data.role === 'admin' && data.is_super === true,
    memberType: data.member_type === 'expert' || data.member_type === 'vendor' ? data.member_type : 'worker',
  }
})

/** 관리자가 들어갈 수 있는 회사 목록 (최고 관리자는 모든 회사) */
export const adminCompanies = cache(async (userId: string, isSuper: boolean): Promise<AdminCompany[]> => {
  const [{ data: members, error }, { data: all }] = await Promise.all([
    db().from('company_members').select('company_id, role').eq('user_id', userId),
    isSuper
      ? db().from('companies').select('id, company_name, created_at, verified').eq('active', true).order('created_at')
      : { data: null },
  ])
  if (error) throw new Error(`회사 확인 실패: ${error.message}`)
  const mine = new Map(((members ?? []) as { company_id: string; role: 'owner' | 'admin' }[]).map((m) => [m.company_id, m.role]))
  let rows = (all ?? []) as { id: string; company_name: string; created_at: string; verified?: boolean | null }[]
  if (!isSuper) {
    if (!mine.size) return []
    const { data } = await db().from('companies').select('id, company_name, created_at, verified').in('id', [...mine.keys()]).eq('active', true)
    rows = (data ?? []) as typeof rows
  }
  return rows
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((c) => ({ id: c.id, name: c.company_name, role: mine.get(c.id) ?? 'super', verified: c.verified !== false }))
})

/** 관리자(최고 관리자 포함)가 이 회사의 자료를 볼 수 있는지 */
export async function canManageCompany(user: SessionUser | null, companyId: string | null | undefined): Promise<boolean> {
  if (!user || user.role !== 'admin' || !companyId) return false
  return (await adminCompanies(user.id, user.isSuper)).some((c) => c.id === companyId)
}

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getUser()
  if (!user) redirect('/login' + (next ? `?next=${encodeURIComponent(next)}` : ''))
  return user
}

/**
 * 관리자 확인 + 지금 보고 있는 회사. 관리자 화면·동작은 모두 이 회사(companyId) 자료만 다룸.
 * 회사는 화면 위 회사 고르기(쿠키)로 바꾸고, 소속이 아닌 회사 id면 첫 회사로.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await getUser()
  if (!user) redirect('/login?next=/admin')
  if (user.role !== 'admin') redirect('/')
  const companies = await adminCompanies(user.id, user.isSuper)
  // 소속 회사가 없으면 (관리자 가입 신청 후 승인 대기 등) 기다리는 화면으로
  if (!companies.length) redirect('/start/wait')
  const want = (await cookies()).get(COMPANY_COOKIE)?.value
  const cur = companies.find((c) => c.id === want) ?? companies[0]
  // 최고 관리자는 어느 회사를 보든 확인된 것으로
  return { ...user, companyId: cur.id, companyName: cur.name, companyVerified: user.isSuper || cur.verified, companies }
}

/** 최고 관리자만 (회사 만들기·관리자 초대) */
export async function requireSuper(): Promise<AdminUser> {
  const admin = await requireAdmin()
  if (!admin.isSuper) redirect('/admin')
  return admin
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
