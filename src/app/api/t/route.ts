import { db } from '@/lib/db'
import { ipKey, overLimit } from '@/lib/ratelimit'
import { getUser } from '@/lib/session'
import { ageBand, screenOf } from '@/lib/usage'

const OK = () => new Response(null, { status: 204 })
const BOT = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|kakaotalk-scrap|Lighthouse/i

/**
 * 화면 이동 기록 받기 (자체 분석). 화면이 보내는 값은 화면 모양·바로 전 화면·머문 시간뿐이고,
 * 회원 유형·성별·나이대는 서버가 로그인 정보로 정함 (화면이 속이지 못하게). 이름·연락처·회원 id는 남기지 않음.
 * 실패해도 늘 204 (분석은 덤 — 화면 동작에 영향 없게)
 */
export async function POST(req: Request) {
  try {
    if (BOT.test(req.headers.get('user-agent') ?? '')) return OK()
    // 다른 사이트에서 보낸 기록은 버림
    const origin = req.headers.get('origin')
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    if (origin && host && new URL(origin).host !== host) return OK()
    if (await overLimit(await ipKey('usage'), 600, 600)) return OK()
    const body = (await req.json().catch(() => null)) as { s?: unknown; k?: unknown; p?: unknown; r?: unknown; ms?: unknown } | null
    if (!body || typeof body.s !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(body.s)) return OK()
    const kind = body.k === 'leave' ? 'leave' : 'view'
    const path = screenOf(body.p)
    if (!path) return OK()
    const prev = kind === 'view' ? screenOf(body.r) : null
    const ms = kind === 'leave' && typeof body.ms === 'number' && Number.isFinite(body.ms) ? Math.round(Math.min(Math.max(body.ms, 0), 30 * 60_000)) : null
    if (kind === 'leave' && (ms === null || ms < 300)) return OK()
    const user = await getUser().catch(() => null)
    let role = 'guest'
    let gender: string | null = null
    let age: string | null = null
    if (user) {
      role = user.role === 'admin' ? 'admin' : (user.memberType ?? 'worker')
      const { data } = await db().from('users').select('gender, birth_date').eq('id', user.id).maybeSingle()
      const u = data as { gender: string | null; birth_date: string | null } | null
      gender = u?.gender === 'M' || u?.gender === 'F' ? u.gender : null
      age = ageBand(u?.birth_date)
    }
    await db().from('usage_events').insert({ session: body.s, role, gender, age_band: age, path, prev, kind, ms })
  } catch {
    // 기록 실패는 무시
  }
  return OK()
}
