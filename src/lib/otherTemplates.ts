import { db } from './db'

export type OtherTpl = { id: string; title: string; kind: string; company: string }

/**
 * 내가 대표·관리자로 속한 다른 회사(최고 관리자 권한으로만 보이는 회사는 빼고)의 계약서 서식 (근로·용역 · 쓰는 것만 · 6개까지)
 * — 공고 쓰기·고치기에서 이 회사에 계약서 서식이 없을 때 바로 가져오게 (정기 개선 2026-11-25 12:35)
 * · 실제로 가져올 때는 서버(copyTemplateHere)가 다시 확인함 · 못 읽으면 빈 목록 (화면은 그대로)
 */
export async function otherCompanyContracts(admin: { companyId: string; companies: { id: string; name: string; role: string }[] }): Promise<OtherTpl[]> {
  const mine = admin.companies.filter((c) => c.id !== admin.companyId && c.role !== 'super')
  if (!mine.length) return []
  const name = new Map(mine.map((c) => [c.id, c.name]))
  return db()
    .from('doc_templates')
    .select('id, title, kind, company_id, active')
    .in('company_id', mine.map((c) => c.id))
    .order('created_at')
    .then(
      (r) =>
        ((r.data ?? []) as { id: string; title: string; kind: string; company_id: string; active: boolean }[])
          .filter((t) => t.active && (t.kind === 'contract' || t.kind === 'service') && name.has(t.company_id))
          .slice(0, 6)
          .map((t) => ({ id: t.id, title: t.title, kind: t.kind, company: name.get(t.company_id) ?? '' })),
      () => [],
    )
}
