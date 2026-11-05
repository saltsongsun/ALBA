'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { canWrite, ensureNickname } from '@/lib/community'
import { linkStates, workedTogether } from '@/lib/coworkers'
import { db, must } from '@/lib/db'
import { sendPush } from '@/lib/push'
import { overLimit } from '@/lib/ratelimit'
import { requireUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

const PAGE = '/community/coworkers'

/** 동료 맺기 (요청 또는 받은 요청 수락). 같은 공고에서 함께 출근한 사람에게만, 하루 30번까지 */
export async function linkCoworker(targetId: string) {
  const user = await requireUser(PAGE)
  if (!canWrite(user) || !isUuid(targetId) || targetId === user.id) return
  if (!(await workedTogether(user.id, targetId))) return
  const state = (await linkStates(user.id, [targetId])).get(targetId)
  if (state === 'sent' || state === 'linked') return
  if (await overLimit(`coworker-link:${user.id}`, 30, 86_400)) return
  must(await db().from('coworker_links').insert({ from_id: user.id, to_id: targetId }))
  const nick = await ensureNickname(user.id)
  // 상대가 이미 요청했으면 지금 서로 동료가 됨
  const now = state === 'received'
  after(() =>
    sendPush([targetId], {
      title: now ? `🤝 ${nick}님과 동료가 됐어요` : `👋 ${nick}님이 동료 맺기를 원해요`,
      body: now ? '같은 공고에 지원하면 서로 보여요.' : '함께 일했던 사람이에요. 수락하면 같은 공고에 지원했을 때 서로 보여요.',
      url: PAGE,
      tag: `coworker-${user.id}`,
    }, { optional: true }),
  )
  revalidatePath(PAGE)
}

/** 동료 끊기·요청 취소 (내 쪽 연결만 지움, 상대에게 알리지 않음) */
export async function unlinkCoworker(targetId: string) {
  const user = await requireUser(PAGE)
  if (!isUuid(targetId)) return
  await db().from('coworker_links').delete().eq('from_id', user.id).eq('to_id', targetId)
  revalidatePath(PAGE)
}
