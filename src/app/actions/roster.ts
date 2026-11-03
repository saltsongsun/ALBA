'use server'

import { after } from 'next/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyPin } from '@/lib/crypto'
import { audit } from '@/lib/data'
import { db } from '@/lib/db'
import { sendPush, superAdminIds } from '@/lib/push'
import { note, overLimit, recent } from '@/lib/ratelimit'
import { ROSTER_COOKIE, ROSTER_MINUTES, rosterNext, rosterToken } from '@/lib/rosterLock'
import { requireAdmin } from '@/lib/session'

type State = { error?: string } | null

const MAX_FAILS = 5
const FAIL_WINDOW = 30 * 60

/** 근무자 명단 잠금 풀기: 관리자 본인 로그인 비밀번호(6자리)를 한 번 더 확인 → 10분 동안 열림 */
export async function unlockRoster(next: string, _: State, form: FormData): Promise<State> {
  const admin = await requireAdmin()
  const bucket = `roster-fail:${admin.id}`
  // 계정이 털렸을 때(사람이든 AI 자동화든) 비밀번호를 계속 넣어 보지 못하게: 30분에 5번 틀리면 막음
  if ((await recent(bucket, FAIL_WINDOW)) >= MAX_FAILS) return { error: '비밀번호를 너무 여러 번 틀렸어요. 30분 뒤에 다시 시도해 주세요.' }
  const pin = String(form.get('pin') ?? '').trim()
  const { data } = await db().from('users').select('pin_hash').eq('id', admin.id).maybeSingle()
  const hash = (data as { pin_hash: string | null } | null)?.pin_hash
  if (!/^\d{6}$/.test(pin) || !hash || !(await verifyPin(pin, hash))) {
    await note(bucket)
    await audit(admin.id, 'roster.unlock_fail', null, null, admin.companyId)
    // 막히는 순간 회사 대표와 최고 관리자에게 알림 (관리자 계정을 남이 쓰고 있을 수 있음, 30분에 한 번)
    if ((await recent(bucket, FAIL_WINDOW)) >= MAX_FAILS && !(await overLimit(`alert:roster-lock:${admin.id}`, 1, FAIL_WINDOW))) {
      after(async () => {
        const { data: own } = await db().from('company_members').select('user_id').eq('company_id', admin.companyId).eq('role', 'owner')
        const to = [...new Set([...((own ?? []) as { user_id: string }[]).map((m) => m.user_id), ...(await superAdminIds())])]
        await sendPush(to, {
          title: '🚨 근무자 명단 잠금 비밀번호 5번 틀림',
          body: `${admin.companyName} · ${admin.name} 계정으로 명단 비밀번호가 계속 틀렸어요. 본인이 아니면 계정을 바로 확인해 주세요.`,
          url: '/admin/settings#admins',
        })
      })
    }
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
