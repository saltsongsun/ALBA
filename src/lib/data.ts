import 'server-only'
import { db, must } from './db'
import { clientInfo } from './session'
import type { Job, Settings } from './types'

export async function getSettings(): Promise<Settings> {
  const data = must(await db().from('settings').select('*').eq('id', 1).maybeSingle())
  return (
    (data as Settings | null) ?? {
      company_name: '주식회사 소켓씨앤씨',
      ceo_name: null,
      business_no: null,
      company_address: null,
      company_phone: null,
      contact_name: null,
      contact_phone: null,
      seal_image: null,
      default_hourly_wage: 10_320,
      workplace_5plus: true,
    }
  )
}

export async function getJob(id: string): Promise<Job | null> {
  const { data } = await db().from('jobs').select('*').eq('id', id).maybeSingle()
  return (data as Job | null) ?? null
}

/** 공고별 확정 인원 수 */
export async function approvedCounts(jobIds: string[]): Promise<Record<string, number>> {
  if (!jobIds.length) return {}
  const rows = must(
    await db().from('applications').select('job_id').in('job_id', jobIds).eq('status', 'approved'),
  ) as { job_id: string }[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.job_id] = (out[r.job_id] ?? 0) + 1
  return out
}

/** 지원 확정 시 공고에 지정된 서류를 서명 대기 상태로 만들어 둡니다. */
export async function ensurePendingDocs(job: Job, userId: string) {
  if (!job.required_docs?.length) return
  const templates = must(
    await db().from('doc_templates').select('id, kind, title').in('id', job.required_docs),
  ) as { id: string; kind: string; title: string }[]
  if (!templates.length) return
  const existing = must(
    await db()
      .from('signed_docs')
      .select('template_id')
      .eq('job_id', job.id)
      .eq('user_id', userId)
      .neq('status', 'void'),
  ) as { template_id: string | null }[]
  const have = new Set(existing.map((e) => e.template_id))
  const missing = templates.filter((t) => !have.has(t.id))
  if (!missing.length) return
  must(
    await db()
      .from('signed_docs')
      .insert(missing.map((t) => ({ job_id: job.id, user_id: userId, template_id: t.id, kind: t.kind, title: t.title }))),
  )
}

export async function audit(
  actorId: string | null,
  action: string,
  targetUserId: string | null = null,
  detail: string | null = null,
) {
  const { ip } = await clientInfo()
  await db().from('audit_logs').insert({ actor_id: actorId, action, target_user_id: targetUserId, detail, ip })
}
