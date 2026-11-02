import { chatText, forbidden, txtDownload } from '@/lib/chatExport'
import { db } from '@/lib/db'
import { getUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

/** 근무자: 한 회사와 주고받은 문의 대화 내려받기 */
export async function GET(req: Request) {
  const user = await getUser()
  if (!user) return forbidden()
  const co = new URL(req.url).searchParams.get('co') ?? ''
  if (!isUuid(co)) return forbidden()
  const [{ data: rows }, { data: company }] = await Promise.all([
    db().from('messages').select('from_admin, body, created_at, sender_id').eq('company_id', co).eq('thread_user_id', user.id).order('created_at').limit(5000),
    db().from('companies').select('company_name').eq('id', co).maybeSingle(),
  ])
  const msgs = (rows ?? []) as { from_admin: boolean; body: string; created_at: string; sender_id: string | null }[]
  const ids = [...new Set(msgs.map((m) => m.sender_id).filter((x): x is string => !!x && x !== user.id))]
  const { data: users } = ids.length ? await db().from('users').select('id, name').in('id', ids) : { data: [] }
  const name = new Map(((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]))
  const companyName = (company as { company_name: string } | null)?.company_name ?? '회사'
  const lines = msgs
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((m) => ({ at: m.created_at, who: m.from_admin ? `${(m.sender_id && name.get(m.sender_id)) || companyName} (담당자)` : user.name, body: m.body }))
  return txtDownload(`문의_${companyName}`, chatText(`${companyName} 문의`, lines))
}
