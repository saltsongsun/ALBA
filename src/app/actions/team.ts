'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { hashPin } from '@/lib/crypto'
import { audit } from '@/lib/data'
import { db, must } from '@/lib/db'
import { companyByJoinCode, normJoinCode, setJoinCode } from '@/lib/joinCode'
import { sendPush, superAdminIds } from '@/lib/push'
import { caughtByHoneypot, ipKey, overLimit } from '@/lib/ratelimit'
import { createSession, getUser, requireAdmin, requireUser, type AdminUser } from '@/lib/session'
import { isPin, isUuid, line, normalizePhone, str, weakPin } from '@/lib/validate'
import type { FormState } from './auth'

// ───────────── 관리자 가입 (회사 코드 → 대표 관리자 승인) ─────────────

const WAIT = '/start/wait'

function back(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(msg)}`)
}

/** 이 회사의 대표 관리자 (없으면 최고 관리자)에게 휴대폰 알림 */
async function tellOwners(companyId: string, title: string, body: string) {
  const { data } = await db().from('company_members').select('user_id').eq('company_id', companyId).eq('role', 'owner')
  const owners = ((data ?? []) as { user_id: string }[]).map((m) => m.user_id)
  await sendPush(owners.length ? owners : await superAdminIds(), { title, body, url: '/admin/settings', tag: `join-${companyId}` })
}

/**
 * 회사 코드를 넣고 관리자 가입 신청.
 * · 로그인 안 했으면 관리자 계정을 새로 만들고 신청 (승인 전에는 어느 회사 자료도 못 봄)
 * · 로그인했으면 그 계정으로 신청 (근무자 계정은 승인되면 관리자로 바뀜)
 * 신청 뒤에는 기다리는 화면으로, 대표 관리자에게 알림
 */
export async function requestJoin(_: FormState, form: FormData): Promise<FormState> {
  if (caughtByHoneypot(form)) return { error: '신청 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  // 코드를 마구 넣어 보지 못하게
  if (await overLimit(await ipKey('join-code'), 10, 3600)) return { error: '시도가 너무 많아요. 한 시간 뒤에 다시 해 주세요.' }
  const code = normJoinCode(str(form, 'code', 20))
  const company = await companyByJoinCode(code)
  if (!company) return { error: '회사 코드가 맞지 않아요. 대표 관리자에게 코드를 다시 확인해 주세요.' }

  const user = await getUser()
  let userId: string
  let name: string
  if (user) {
    if (user.role !== 'admin' && user.memberType === 'vendor') {
      return { error: '외주 업체 계정으로는 관리자가 될 수 없어요. 로그아웃한 뒤 담당자 번호로 따로 가입해 주세요.' }
    }
    const [{ count: member }, { count: asked }] = await Promise.all([
      db().from('company_members').select('user_id', { count: 'exact', head: true }).eq('company_id', company.id).eq('user_id', user.id),
      db().from('company_join_requests').select('user_id', { count: 'exact', head: true }).eq('company_id', company.id).eq('user_id', user.id),
    ])
    if (member || user.isSuper) return { error: `이미 ${company.company_name} 관리자예요.` }
    if (asked) redirect(WAIT)
    userId = user.id
    name = user.name
  } else {
    name = line(form, 'name', 30)
    const phone = normalizePhone(str(form, 'phone'))
    const pin = str(form, 'pin')
    if (name.length < 2) return { error: '이름을 입력해 주세요.' }
    if (!phone) return { error: '휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)' }
    if (!isPin(pin)) return { error: '비밀번호는 숫자 6자리로 정해 주세요.' }
    if (pin !== str(form, 'pin2')) return { error: '비밀번호 확인이 일치하지 않습니다.' }
    const weak = weakPin(pin, { phone })
    if (weak) return { error: weak }
    if (form.get('agree_privacy') !== 'on') return { error: '필수 동의 항목에 체크해 주세요.' }
    const { data: byPhone } = await db().from('users').select('id').eq('phone', phone).maybeSingle()
    if (byPhone) return { error: '이미 가입된 휴대폰 번호예요. 로그인한 뒤 회사 코드를 넣어 주세요.', code: 'dup_phone' }
    // 관리자 계정이지만 소속 회사가 없어 승인 전에는 아무 회사 자료도 못 봄
    const created = must(
      await db()
        .from('users')
        .insert({ role: 'admin', name, phone, pin_hash: await hashPin(pin), privacy_agreed_at: new Date().toISOString() })
        .select('id, session_version')
        .single(),
    ) as { id: string; session_version: number }
    userId = created.id
    await createSession(userId, created.session_version, 'admin')
  }

  must(await db().from('company_join_requests').upsert({ company_id: company.id, user_id: userId }, { onConflict: 'company_id,user_id' }))
  await audit(userId, 'company.join_request', userId, company.company_name, company.id)
  after(() => tellOwners(company.id, '🧑‍💼 관리자 가입 신청', `${name}님이 ${company.company_name} 관리자로 가입을 신청했어요. 회사 설정에서 승인해 주세요.`))
  redirect(WAIT)
}

/** 내 신청 취소 */
export async function cancelJoin(companyId: string) {
  const user = await requireUser(WAIT)
  if (!isUuid(companyId)) return
  must(await db().from('company_join_requests').delete().eq('company_id', companyId).eq('user_id', user.id))
  revalidatePath(WAIT)
  back(WAIT, '신청을 취소했어요.')
}

/** 대표 관리자(또는 최고 관리자)만: 관리자 승인·거절, 코드 바꾸기, 관리자 빼기 */
async function requireOwner(): Promise<AdminUser> {
  const admin = await requireAdmin()
  const owner = admin.isSuper || admin.companies.find((c) => c.id === admin.companyId)?.role === 'owner'
  if (!owner) back('/admin/settings', '관리자 초대·승인은 대표 관리자만 할 수 있어요.')
  return admin
}

/** 가입 신청 승인·거절 */
export async function decideJoin(userId: string, accept: boolean) {
  const admin = await requireOwner()
  if (!isUuid(userId)) return
  const path = '/admin/settings'
  const [{ count: asked }, { data: u }] = await Promise.all([
    db().from('company_join_requests').select('user_id', { count: 'exact', head: true }).eq('company_id', admin.companyId).eq('user_id', userId),
    db().from('users').select('name, role, active, session_version').eq('id', userId).maybeSingle(),
  ])
  const target = u as { name: string; role: string; active: boolean; session_version: number } | null
  if (!asked || !target) back(path, '신청을 찾을 수 없어요. 이미 처리됐을 수 있어요.')

  if (!accept) {
    must(await db().from('company_join_requests').delete().eq('company_id', admin.companyId).eq('user_id', userId))
    await audit(admin.id, 'company.join_reject', userId, null, admin.companyId)
    after(() => sendPush([userId], { title: '관리자 신청 결과', body: `${admin.companyName} 관리자 신청이 받아들여지지 않았어요.`, url: WAIT }))
    revalidatePath(path)
    back(path, `${target.name}님의 신청을 거절했어요.`)
  }

  if (!target.active) back(path, '로그인이 정지된 계정이에요.')
  must(await db().from('company_members').upsert({ company_id: admin.companyId, user_id: userId, role: 'admin' }, { onConflict: 'company_id,user_id' }))
  // 근무자 계정이었으면 관리자로 바꾸고 다시 로그인하게 (근무자 로그인이 그대로 관리자 권한으로 이어지지 않게)
  const promoted = target.role !== 'admin'
  if (promoted) must(await db().from('users').update({ role: 'admin', session_version: target.session_version + 1 }).eq('id', userId))
  must(await db().from('company_join_requests').delete().eq('company_id', admin.companyId).eq('user_id', userId))
  await audit(admin.id, 'company.join_approve', userId, admin.companyName, admin.companyId)
  after(() =>
    sendPush([userId], {
      title: '✅ 관리자로 승인됐어요',
      body: `${admin.companyName} 관리자가 됐어요.${promoted ? ' 다시 로그인하면 관리자 화면이 열려요.' : ''}`,
      url: '/admin',
    }),
  )
  revalidatePath(path)
  revalidatePath('/admin')
  back(path, `${target.name}님을 관리자로 승인했어요.`)
}

/** 초대 코드 새로 만들기 (예전 코드는 바로 못 씀) */
export async function renewJoinCode() {
  const admin = await requireOwner()
  await setJoinCode(admin.companyId)
  await audit(admin.id, 'company.join_code_renew', null, null, admin.companyId)
  revalidatePath('/admin/settings')
  back('/admin/settings', '새 코드로 바꿨어요. 예전 코드로는 이제 가입할 수 없어요.')
}

/** 우리 회사 관리자 빼기 (대표 관리자는 못 뺌, 자기 자신도 못 뺌) */
export async function removeTeamAdmin(userId: string) {
  const admin = await requireOwner()
  const path = '/admin/settings'
  if (!isUuid(userId) || userId === admin.id) back(path, '자기 자신은 뺄 수 없어요.')
  const { data: m } = await db().from('company_members').select('role').eq('company_id', admin.companyId).eq('user_id', userId).maybeSingle()
  const member = m as { role: string } | null
  if (!member) back(path, '이 회사 관리자가 아니에요.')
  if (member.role === 'owner' && !admin.isSuper) back(path, '대표 관리자는 뺄 수 없어요.')
  must(await db().from('company_members').delete().eq('company_id', admin.companyId).eq('user_id', userId))
  // 어느 회사에도 속하지 않으면 근무자 계정으로 (다시 로그인)
  const [{ count: left }, { data: u }] = await Promise.all([
    db().from('company_members').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
    db().from('users').select('name, is_super, session_version').eq('id', userId).maybeSingle(),
  ])
  const target = u as { name: string; is_super: boolean; session_version: number } | null
  if (!left && target && !target.is_super) must(await db().from('users').update({ role: 'worker', session_version: target.session_version + 1 }).eq('id', userId))
  await audit(admin.id, 'company.admin_remove', userId, null, admin.companyId)
  revalidatePath(path)
  back(path, `${target?.name ?? '관리자'}님을 이 회사 관리자에서 뺐어요.`)
}
