import 'server-only'
import { db } from './db'

/**
 * 이 사업자등록번호(숫자 10자리)를 쓰는 회사 id들 (줄표 있든 없든 숫자만 맞춰 봄).
 * 서버 안에서만 씀 — 화면에는 '있다/없다'만 알려 줌 (actions/company bizNoTaken)
 */
export async function bizNoOwners(bizNo: string): Promise<string[]> {
  const d = bizNo.replace(/\D/g, '')
  if (d.length !== 10) return []
  const { data } = await db().from('companies').select('id, business_no')
  return ((data ?? []) as { id: string; business_no: string | null }[]).filter((c) => (c.business_no ?? '').replace(/\D/g, '') === d).map((c) => c.id)
}
