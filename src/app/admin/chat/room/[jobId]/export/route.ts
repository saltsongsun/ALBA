import { chatText, forbidden, txtDownload } from '@/lib/chatExport'
import { companyJob } from '@/lib/company'
import { roomMessages } from '@/lib/room'
import { getUser, requireAdmin } from '@/lib/session'

/** 관리자: 단체방 대화 내려받기 (이 회사 공고만) */
export async function GET(_: Request, ctx: RouteContext<'/admin/chat/room/[jobId]/export'>) {
  const user = await getUser()
  if (!user || user.role !== 'admin') return forbidden()
  const admin = await requireAdmin()
  const { jobId } = await ctx.params
  const job = await companyJob(admin, jobId)
  if (!job) return forbidden()
  const msgs = await roomMessages(job.id, 10000)
  return txtDownload(`단체방_${job.title}`, chatText(`${job.title} 단체방`, msgs.map((m) => ({ at: m.created_at, who: m.from_admin ? `${m.name} (담당자)` : m.name, body: m.body }))))
}
