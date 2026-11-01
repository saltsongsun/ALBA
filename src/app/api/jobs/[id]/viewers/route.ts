import { canManageCompany, getUser } from '@/lib/session'
import { getJob } from '@/lib/data'
import { isUuid } from '@/lib/validate'
import { viewStats } from '@/lib/views'

/** 관리자 화면의 조회 현황 숫자 (몇 초마다 다시 읽음) */
export async function GET(_: Request, ctx: RouteContext<'/api/jobs/[id]/viewers'>) {
  const { id } = await ctx.params
  const user = await getUser()
  if (!user || user.role !== 'admin') return new Response(null, { status: 403 })
  if (!isUuid(id)) return new Response(null, { status: 404 })
  const job = await getJob(id)
  if (!job || !(await canManageCompany(user, job.company_id))) return new Response(null, { status: 404 })
  const s = (await viewStats([id]))[id]
  return Response.json(s, { headers: { 'Cache-Control': 'no-store' } })
}
