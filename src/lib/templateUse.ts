import { db } from '@/lib/db'
import { kstDate } from '@/lib/time'

/**
 * 서식이 어디에 쓰이는지 (정기 개선 2026-11-24 07:35)
 * · 진행 중 공고: 모집 중·마감이고 아직 끝나지 않은 이 회사 공고 중 그 서식을 서명받을 서류로 고른 것
 * · 서명 기다리는 서류: 아직 서명 전이라 열 때 지금 서식 내용으로 그려지는 것 (서식을 고치면 고친 내용으로 서명함)
 * 모두 이 회사 것만 (company_id로 거름)
 */
type JobRow = { id: string; title: string; status: string; end_date: string; required_docs: string[] | null }

async function liveJobs(companyId: string): Promise<JobRow[]> {
  const today = kstDate()
  const { data } = await db()
    .from('jobs')
    .select('id, title, status, end_date, required_docs')
    .eq('company_id', companyId)
    .in('status', ['open', 'closed'])
    .gte('end_date', today)
    .order('start_date')
    .limit(500)
  return ((data ?? []) as JobRow[]).filter((j) => ['open', 'closed'].includes(j.status) && j.end_date >= today)
}

export async function templateUse(companyId: string, templateId: string): Promise<{ jobs: { id: string; title: string }[]; pending: number }> {
  const [jobs, pending] = await Promise.all([
    liveJobs(companyId).then((js) => js.filter((j) => (j.required_docs ?? []).includes(templateId)).map((j) => ({ id: j.id, title: j.title }))),
    db()
      .from('signed_docs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('template_id', templateId)
      .eq('status', 'pending')
      .then((r) => r.count ?? 0, () => 0),
  ])
  return { jobs, pending }
}

/** 서식 목록용: 서식마다 진행 중 공고 수 */
export async function templateJobCounts(companyId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const j of await liveJobs(companyId).catch(() => [] as JobRow[])) for (const t of new Set(j.required_docs ?? [])) counts.set(t, (counts.get(t) ?? 0) + 1)
  return counts
}
