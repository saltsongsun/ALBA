import 'server-only'
import { db, must } from './db'
import { SIGNAL } from './signals'

/**
 * 근무자에게 '💳 계좌 등록 요청'을 보낸 회사 가운데 아직 '계좌 등록함'을 듣지 못한 곳 (최근 60일 · 회사마다 가장 최근 것만 봄).
 * - 근무자 내 정보: '○○에서 계좌를 기다려요' 한 줄
 * - 계좌를 처음 등록하면: 이 회사들 문의함에만 '계좌 등록함'을 알림 (요청하지 않은 회사에는 아무것도 안 감)
 * 정기 개선 2026-11-26 05:35
 */
export type AccountAsker = { companyId: string; jobId: string | null; name: string }

export async function accountAskers(userId: string): Promise<AccountAsker[]> {
  const since = new Date(Date.now() - 60 * 864e5).toISOString()
  const rows = must(
    await db()
      .from('messages')
      .select('company_id, job_id, from_admin, body, created_at')
      .eq('thread_user_id', userId)
      .like('body', '💳 계좌 등록%')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(300),
  ) as { company_id: string | null; job_id: string | null; from_admin: boolean; body: string; created_at: string }[]
  // 회사마다 가장 최근 글: 요청이면 기다리는 중, 근무자의 '등록함'이면 이미 알림
  const last = new Map<string, { jobId: string | null } | null>()
  for (const r of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!r.company_id || r.created_at < since || last.has(r.company_id)) continue
    if (r.from_admin && r.body.startsWith(SIGNAL.account)) last.set(r.company_id, { jobId: r.job_id })
    else if (!r.from_admin && r.body.startsWith(SIGNAL.accountDone)) last.set(r.company_id, null)
  }
  const waiting = [...last].filter((e): e is [string, { jobId: string | null }] => e[1] !== null)
  if (!waiting.length) return []
  const { data } = await db()
    .from('companies')
    .select('id, company_name')
    .in(
      'id',
      waiting.map(([id]) => id),
    )
  const names = new Map(((data ?? []) as { id: string; company_name: string | null }[]).map((c) => [c.id, (c.company_name ?? '').trim()]))
  return waiting.map(([companyId, v]) => ({ companyId, jobId: v.jobId, name: names.get(companyId) || '회사' }))
}

/** '○○' · '○○·△△' · '○○ 외 2곳' (한 줄에 짧게) */
export function askersText(list: readonly { name: string }[]): string {
  if (list.length <= 2) return list.map((a) => a.name).join('·')
  return `${list[0].name} 외 ${list.length - 1}곳`
}
