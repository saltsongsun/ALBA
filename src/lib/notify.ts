import 'server-only'
import { after } from 'next/server'
import { db, must } from './db'
import { sendPush } from './push'

/**
 * 근무자 각자의 문의함에 담당자 메시지로 남기고 휴대폰 알림도 보냄.
 * 본문 첫 줄은 title (화면에서 종류를 알아보는 머리말), 둘째 줄부터 text. text는 사람마다 다르게 줄 수 있음.
 */
export async function tellWorkers(
  to: string[],
  o: {
    senderId: string | null
    /** 어느 회사 문의함에 남길지 (공고가 있으면 공고의 회사) */
    companyId: string
    jobId: string | null
    title: string
    text: string | ((uid: string) => string)
    url?: string
    tag?: string
  },
) {
  const ids = [...new Set(to)]
  if (!ids.length) return 0
  const textOf = (uid: string) => (typeof o.text === 'function' ? o.text(uid) : o.text)
  must(
    await db()
      .from('messages')
      .insert(
        ids.map((uid) => ({
          thread_user_id: uid,
          sender_id: o.senderId,
          from_admin: true,
          company_id: o.companyId,
          job_id: o.jobId,
          body: `${o.title}\n${textOf(uid)}`.slice(0, 2000),
        })),
      ),
  )
  const url = o.url ?? '/me'
  after(async () => {
    // 휴대폰 알림 제목에 회사 이름: 여러 회사 일을 하는 근무자가 잠금 화면에서도 어느 회사 알림인지 알게 (문의함은 이미 회사별)
    const { data: co } = await db().from('companies').select('company_name').eq('id', o.companyId).maybeSingle()
    const name = (co as { company_name: string } | null)?.company_name?.trim()
    const title = name ? `${o.title} · ${name}` : o.title
    if (typeof o.text === 'string') await sendPush(ids, { title, body: o.text, url, tag: o.tag })
    else for (const uid of ids) await sendPush([uid], { title, body: textOf(uid), url, tag: o.tag })
  })
  return ids.length
}
