import { chatText, forbidden, txtDownload } from '@/lib/chatExport'
import { getSettings } from '@/lib/data'
import { roomMessages, workerRoom } from '@/lib/room'
import { getUser } from '@/lib/session'

/** 근무자: 같은 근무 단체방 대화 내려받기 (지금 확정된 사람만) */
export async function GET(_: Request, ctx: RouteContext<'/me/chat/room/[jobId]/export'>) {
  const { jobId } = await ctx.params
  const user = await getUser()
  if (!user) return forbidden()
  const job = await workerRoom(user.id, jobId)
  if (!job) return forbidden()
  const [msgs, company] = await Promise.all([roomMessages(job.id, 10000), getSettings(job.company_id).catch(() => null)])
  // 파일 이름 앞에 회사 이름 (여러 회사에서 일해도 받은 파일이 어느 회사 단체방인지)
  return txtDownload(`${company?.company_name ? `${company.company_name}_` : ''}단체방_${job.title}`, chatText(`${job.title} 단체방`, msgs.map((m) => ({ at: m.created_at, who: m.from_admin ? `${m.name} (담당자)` : m.name, body: m.body }))))
}
