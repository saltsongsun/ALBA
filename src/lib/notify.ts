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
          job_id: o.jobId,
          body: `${o.title}\n${textOf(uid)}`.slice(0, 2000),
        })),
      ),
  )
  const url = o.url ?? '/me'
  after(async () => {
    if (typeof o.text === 'string') await sendPush(ids, { title: o.title, body: o.text, url, tag: o.tag })
    else for (const uid of ids) await sendPush([uid], { title: o.title, body: textOf(uid), url, tag: o.tag })
  })
  return ids.length
}
