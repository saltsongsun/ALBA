'use server'

import { revalidatePath } from 'next/cache'
import { canWrite, ensureNickname } from '@/lib/community'
import { coworkersEnabled, shareStates, workedTogether } from '@/lib/coworkers'
import { FEATURES, type FeatureKey } from '@/lib/flags'
import { audit } from '@/lib/data'
import { requireSuper } from '@/lib/session'
import { redirect } from 'next/navigation'
import { db, must } from '@/lib/db'
import { overLimit } from '@/lib/ratelimit'
import { requireUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

const PAGE = '/community/coworkers'

/**
 * 내 지원 공고 보여 주기: 같은 공고에서 함께 출근한 사람에게만, 하루 30번까지.
 * 내 지원만 그 사람에게 보이고(별명), 상대의 지원은 보이지 않음 · 상대에게 알림을 보내지 않음 (부담·스토킹 걱정 없이)
 */
export async function linkCoworker(targetId: string) {
  const user = await requireUser(PAGE)
  if (!canWrite(user) || !isUuid(targetId) || targetId === user.id || !(await coworkersEnabled())) return
  if (!(await workedTogether(user.id, targetId))) return
  if ((await shareStates(user.id, [targetId])).get(targetId)?.mine) return
  if (await overLimit(`coworker-link:${user.id}`, 30, 86_400)) return
  must(await db().from('coworker_links').insert({ from_id: user.id, to_id: targetId }))
  await ensureNickname(user.id)
  revalidatePath(PAGE)
}

/** 그만 보여 주기 (내 쪽만 지움 · 상대에게 알리지 않음) */
export async function unlinkCoworker(targetId: string) {
  const user = await requireUser(PAGE)
  if (!isUuid(targetId)) return
  await db().from('coworker_links').delete().eq('from_id', user.id).eq('to_id', targetId)
  revalidatePath(PAGE)
}

/** 최상위 관리자: 서비스 전체 기능 켜기·끄기 (기록이 남음) */
export async function setFeature(key: FeatureKey, on: boolean) {
  const admin = await requireSuper()
  if (!(key in FEATURES)) return
  await audit(admin.id, `feature.${key}`, null, on ? 'on' : 'off', null)
  revalidatePath('/', 'layout')
  const name = FEATURES[key].label
  redirect(`/admin/community?m=${encodeURIComponent(`'${name}' 기능을 ${on ? '켰어요' : '껐어요'}`)}`)
}
