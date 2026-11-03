'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyPin } from '@/lib/crypto'
import { audit } from '@/lib/data'
import { db } from '@/lib/db'
import { note, recent } from '@/lib/ratelimit'
import { ROSTER_COOKIE, ROSTER_MINUTES, rosterNext, rosterToken } from '@/lib/rosterLock'
import { requireAdmin } from '@/lib/session'

type State = { error?: string } | null

/** 근무자 명단 잠금 풀기: 관리자 본인 로그인 비밀번호(6자리)를 한 번 더 확인 → 10분 동안 열림 */
export async function unlockRoster(next: string, _: State, form: FormData): Promise<State> {
  const admin = await requireAdmin()
  const bucket = `roster-fail:${admin.id}`
  // 계정이 털렸을 때 비밀번호를 계속 넣어 보지 못하게: 15분에 8번 틀리면 잠시 막음
  if ((await recent(bucket, 900)) >= 8) return { error: '비밀번호를 너무 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.' }
  const pin = String(form.get('pin') ?? '').trim()
  const { data } = await db().from('users').select('pin_hash').eq('id', admin.id).maybeSingle()
  const hash = (data as { pin_hash: string | null } | null)?.pin_hash
  if (!/^\d{6}$/.test(pin) || !hash || !(await verifyPin(pin, hash))) {
    await note(bucket)
    await audit(admin.id, 'roster.unlock_fail', null, null, admin.companyId)
    return { error: '비밀번호가 맞지 않아요. 로그인할 때 쓰는 6자리 비밀번호를 넣어 주세요.' }
  }
  ;(await cookies()).set(ROSTER_COOKIE, rosterToken(admin.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: ROSTER_MINUTES * 60,
  })
  await audit(admin.id, 'roster.unlock', null, `${ROSTER_MINUTES}분`, admin.companyId)
  redirect(rosterNext(next))
}

/** 다 봤으면 바로 다시 잠그기 */
export async function lockRoster() {
  await requireAdmin()
  ;(await cookies()).delete({ name: ROSTER_COOKIE, path: '/admin' })
  redirect('/admin/workers')
}
