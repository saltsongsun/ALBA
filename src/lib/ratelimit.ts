import 'server-only'
import { db } from './db'
import { clientInfo } from './session'

/**
 * 자동화 공격(봇·AI 에이전트) 방어: 로그인 실패·가입·민감 정보 열람 같은 일을 IP·계정별로 세어 너무 잦으면 막음.
 * 기록을 못 읽거나 못 쓰면 막지 않음 (서비스는 계속되게)
 */

/** 최근 windowSec초 동안 bucket에 쌓인 횟수 */
export async function recent(bucket: string, windowSec: number): Promise<number> {
  const { count, error } = await db()
    .from('rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', bucket)
    .gte('created_at', new Date(Date.now() - windowSec * 1000).toISOString())
  return error ? 0 : (count ?? 0)
}

/** 한 번 기록 */
export async function note(...buckets: string[]) {
  if (buckets.length) await db().from('rate_events').insert(buckets.map((bucket) => ({ bucket })))
}

/** 이미 limit번 넘게 했으면 true(막음). 아니면 이번 것을 기록하고 false */
export async function overLimit(bucket: string, limit: number, windowSec: number): Promise<boolean> {
  if ((await recent(bucket, windowSec)) >= limit) return true
  await note(bucket)
  return false
}

/** 요청한 곳의 IP로 묶은 이름 (Vercel이 x-forwarded-for를 실제 접속 IP로 덮어씀) */
export async function ipKey(prefix: string): Promise<string> {
  const { ip } = await clientInfo()
  return `${prefix}:ip:${ip || 'unknown'}`
}

/** 이틀 지난 기록 지우기 (매일 한 번) */
export async function cleanupRateEvents() {
  await db().from('rate_events').delete().lt('created_at', new Date(Date.now() - 2 * 86_400_000).toISOString())
}

/**
 * 봇 함정 칸: 화면에는 안 보이는 'website' 칸을 사람은 비워 두지만 자동 입력 봇은 채움.
 * 채워져 있으면 true
 */
export function caughtByHoneypot(form: FormData): boolean {
  return String(form.get('website') ?? '').trim() !== ''
}
