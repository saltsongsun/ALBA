import { chatText, forbidden, txtDownload } from '@/lib/chatExport'
import { db } from '@/lib/db'
import { getUser, requireAdmin } from '@/lib/session'
import { isUuid } from '@/lib/validate'

/** 관리자: 근무자 한 명과의 문의 대화 내려받기 (이 회사 대화만) */
export async function GET(_: Request, ctx: RouteContext<'/admin/chat/[userId]/export'>) {
  const user = await getUser()
  if (!user || user.role !== 'admin') return forbidden()
  const admin = await requireAdmin()
  const { userId } = await ctx.params
  if (!isUuid(userId)) return forbidden()
  const { data: rows } = await db()
    .from('messages')
    .select('from_admin, body, created_at, sender_id')
    .eq('company_id', admin.companyId)
    .eq('thread_user_id', userId)
    .order('created_at')
    .limit(5000)
  const msgs = (rows ?? []) as { from_admin: boolean; body: string; created_at: string; sender_id: string | null }[]
  if (!msgs.length) return forbidden()
  const ids = [...new Set([userId, ...msgs.map((m) => m.sender_id).filter((x): x is string => !!x)])]
  const { data: users } = await db().from('users').select('id, name').in('id', ids)
  const name = new Map(((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]))
  const worker = name.get(userId) ?? '근무자'
  const lines = msgs
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((m) => ({ at: m.created_at, who: m.from_admin ? `${(m.sender_id && name.get(m.sender_id)) || '담당자'} (담당자)` : worker, body: m.body }))
  return txtDownload(`문의_${worker}`, chatText(`${admin.companyName} · ${worker} 문의`, lines))
}
