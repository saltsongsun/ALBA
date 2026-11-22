import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

// service role 키로 RLS를 우회하는 서버 전용 클라이언트.
// 권한 확인은 이 클라이언트를 부르는 쪽(페이지·서버 액션)에서 반드시 먼저 합니다.
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    // 새 비밀 키(sb_secret_…)가 있으면 그것을 먼저 (예전 service_role 키는 2026년 말까지만 동작 · 새 키는 따로 바꾸고 끌 수 있음 — 보안 강화 2026-11-22)
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

// Supabase 오류를 그대로 던져 개발 중 원인을 바로 보이게 합니다.
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const ID_CHUNK = 100 // 한 번에 묻는 id 수

/**
 * 긴 id 목록으로 묻기: 100개씩 나눠 한꺼번에 묻고 합침.
 * 한 번에 수백 개를 넣으면 주소가 너무 길어져 DB 앞단에서 거절됨 → 이름·알림·신고자료가 통째로 빠짐
 * (사람·서류가 쌓일수록 생기는 문제). 하나라도 실패하면 그 오류를 함께 돌려줌 (부르는 쪽이 예전과 똑같이 처리 · must()도 그대로)
 * 나눠 물으면 전체 정렬은 보장되지 않으니, 순서가 필요하면 받은 뒤 정렬할 것
 */
export async function byIds<T>(
  ids: readonly string[],
  run: (part: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const uniq = [...new Set(ids)]
  if (!uniq.length) return { data: [], error: null }
  const parts = Array.from({ length: Math.ceil(uniq.length / ID_CHUNK) }, (_, i) => uniq.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK))
  const res = await Promise.all(parts.map((p) => run(p)))
  return { data: res.flatMap((r) => (r.data ?? []) as T[]), error: res.find((r) => r.error)?.error ?? null }
}

const PAGE = 1000 // 한 번에 받는 줄 수 (Supabase 기본 상한 — 넘는 줄은 말없이 잘림)
const BATCH = 4 // 기록이 많을 때 한 번에 함께 받는 쪽 수

/**
 * 상한(1000줄)에 걸려 잘리지 않게 끝까지 나눠 받기 (최대 5만 줄 · 순서가 정해지도록 order를 꼭 붙여서 부를 것).
 * 첫 쪽이 꽉 차면 다음 쪽들은 몇 개씩 한꺼번에 받음 (한 쪽씩 차례로 기다리지 않게)
 */
export async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error?: { message: string } | null }>): Promise<T[]> {
  const take = (r: { data: unknown; error?: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message)
    return (r.data ?? []) as T[]
  }
  const first = take(await page(0, PAGE - 1))
  const out: T[] = [...first]
  if (first.length < PAGE) return out
  for (let from = PAGE; from < 50 * PAGE; from += BATCH * PAGE) {
    const pages = await Promise.all(Array.from({ length: BATCH }, (_, i) => page(from + i * PAGE, from + (i + 1) * PAGE - 1)))
    let last = false
    for (const r of pages) {
      const rows = take(r)
      out.push(...rows)
      if (rows.length < PAGE) {
        last = true
        break
      }
    }
    if (last) break
  }
  return out
}

/** 긴 id 목록 + 1000줄 상한을 함께: 100개씩 나누고, 나눈 묶음마다 끝까지 받음 (실패하면 오류를 던짐) */
export async function allByIds<T>(
  ids: readonly string[],
  page: (part: string[], from: number, to: number) => PromiseLike<{ data: unknown; error?: { message: string } | null }>,
): Promise<T[]> {
  const uniq = [...new Set(ids)]
  if (!uniq.length) return []
  const parts = Array.from({ length: Math.ceil(uniq.length / ID_CHUNK) }, (_, i) => uniq.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK))
  return (await Promise.all(parts.map((p) => allPages<T>((a, b) => page(p, a, b))))).flat()
}
