'use server'

import { randomInt } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { hashPin } from '@/lib/crypto'
import { audit, platformCompanyId } from '@/lib/data'
import { db, must } from '@/lib/db'
import { DEFAULT_TEMPLATES } from '@/lib/default-templates'
import { MIN_WAGE_2026 } from '@/lib/pay'
import { adminCompanies, COMPANY_COOKIE, getUser, requireSuper } from '@/lib/session'
import { isUuid, normalizePhone, optStr, str, weakPin } from '@/lib/validate'
import type { FormState } from './auth'

function back(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(msg)}`)
}

/** 관리자 화면에서 볼 회사 바꾸기 (들어갈 수 있는 회사만) */
export async function switchCompany(form: FormData) {
  const companyId = str(form, 'company', 40)
  const user = await getUser()
  if (!user || user.role !== 'admin') redirect('/')
  const ok = (await adminCompanies(user.id, user.isSuper)).some((c) => c.id === companyId)
  if (!ok) back('/admin', '들어갈 수 없는 회사예요.')
  ;(await cookies()).set(COMPANY_COOKIE, companyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  redirect('/admin')
}

/** 회사 만들기 (최고 관리자만): 기본 서류 서식을 함께 넣고, 만든 사람을 대표 관리자로 */
export async function createCompany(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireSuper()
  const company_name = str(form, 'company_name', 100)
  if (company_name.length < 2) return { error: '회사 이름(상호)을 입력해 주세요.' }
  const { data, error } = await db()
    .from('companies')
    .insert({
      company_name,
      ceo_name: optStr(form, 'ceo_name', 30),
      business_no: optStr(form, 'business_no', 20),
      contact_phone: normalizePhone(str(form, 'contact_phone')) ?? optStr(form, 'contact_phone', 20),
      default_hourly_wage: MIN_WAGE_2026,
      workplace_5plus: true,
      active: true,
    })
    .select('id')
    .single()
  if (error || !data) return { error: '회사를 만들지 못했어요. 다시 시도해 주세요.' }
  const id = (data as { id: string }).id
  must(await db().from('doc_templates').insert(DEFAULT_TEMPLATES.map((t) => ({ ...t, company_id: id }))))
  must(await db().from('company_members').insert({ company_id: id, user_id: admin.id, role: 'owner' }))
  await audit(admin.id, 'company.create', null, company_name, id)
  revalidatePath('/admin/companies')
  back('/admin/companies', `${company_name}을(를) 만들었어요. 관리자를 초대해 주세요.`)
}

/**
 * 회사에 관리자 초대 (최고 관리자만): 휴대폰 번호로.
 * 가입된 사람이면 그 계정을 이 회사 관리자로, 처음이면 관리자 계정을 만들고 임시 비밀번호를 한 번만 보여 줌
 */
export async function addCompanyAdmin(companyId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireSuper()
  if (!isUuid(companyId)) return { error: '잘못된 요청입니다.' }
  const { data: company } = await db().from('companies').select('id, company_name').eq('id', companyId).maybeSingle()
  if (!company) return { error: '회사를 찾을 수 없어요.' }
  const phone = normalizePhone(str(form, 'phone'))
  if (!phone) return { error: '휴대폰 번호를 정확히 입력해 주세요.' }
  const role = str(form, 'role') === 'owner' ? 'owner' : 'admin'
  const { data: existing } = await db().from('users').select('id, name, role, active').eq('phone', phone).maybeSingle()
  let userId: string
  let temp: string | null = null
  let name: string
  if (existing) {
    if (!existing.active) return { error: '로그인이 정지된 계정이에요. 먼저 정지를 풀어 주세요.' }
    userId = existing.id
    name = existing.name
    if (existing.role !== 'admin') must(await db().from('users').update({ role: 'admin' }).eq('id', userId))
  } else {
    name = str(form, 'name', 30)
    if (name.length < 2) return { error: '처음 쓰는 번호예요. 관리자 이름도 입력해 주세요.' }
    temp = String(randomInt(0, 1_000_000)).padStart(6, '0')
    while (weakPin(temp, { phone })) temp = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const created = must(
      await db()
        .from('users')
        .insert({ role: 'admin', name, phone, pin_hash: await hashPin(temp), privacy_agreed_at: new Date().toISOString() })
        .select('id')
        .single(),
    ) as { id: string }
    userId = created.id
  }
  must(await db().from('company_members').upsert({ company_id: companyId, user_id: userId, role }, { onConflict: 'company_id,user_id' }))
  await audit(admin.id, 'company.admin_add', userId, `${company.company_name} ${role}`, companyId)
  revalidatePath('/admin/companies')
  return {
    ok: temp
      ? `${name}님 관리자 계정을 만들었어요. 임시 비밀번호 ${temp} (이 화면을 벗어나면 다시 볼 수 없어요. 로그인 후 바꾸도록 알려 주세요)`
      : `${name}님을 ${company.company_name} 관리자로 추가했어요.`,
  }
}

/** 회사에서 관리자 빼기 (최고 관리자만). 어느 회사에도 속하지 않으면 근무자 계정으로 */
export async function removeCompanyAdmin(companyId: string, userId: string) {
  const admin = await requireSuper()
  if (!isUuid(companyId) || !isUuid(userId)) return
  must(await db().from('company_members').delete().eq('company_id', companyId).eq('user_id', userId))
  const [{ count: left }, { data: u }] = await Promise.all([
    db().from('company_members').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
    db().from('users').select('is_super').eq('id', userId).maybeSingle(),
  ])
  if (!left && !u?.is_super) must(await db().from('users').update({ role: 'worker' }).eq('id', userId))
  await audit(admin.id, 'company.admin_remove', userId, null, companyId)
  revalidatePath('/admin/companies')
}

/** 회사 사용 중지·다시 사용 (최고 관리자만, 기본 회사는 중지 못 함). 중지하면 공고·관리자 화면에서 빠짐 */
export async function setCompanyActive(companyId: string, active: boolean) {
  const admin = await requireSuper()
  if (!isUuid(companyId)) return
  if (!active && companyId === (await platformCompanyId())) back('/admin/companies', '기본 회사는 중지할 수 없어요.')
  must(await db().from('companies').update({ active }).eq('id', companyId))
  if (!active) must(await db().from('jobs').update({ status: 'closed' }).eq('company_id', companyId).eq('status', 'open'))
  await audit(admin.id, active ? 'company.activate' : 'company.deactivate', null, null, companyId)
  revalidatePath('/admin/companies')
  revalidatePath('/')
}
