'use server'

import { randomInt } from 'node:crypto'
import { cookies } from 'next/headers'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { hashPin } from '@/lib/crypto'
import { audit, platformCompanyId } from '@/lib/data'
import { db, must } from '@/lib/db'
import { DEFAULT_TEMPLATES } from '@/lib/default-templates'
import { MIN_WAGE_2026 } from '@/lib/pay'
import { adminCompanies, COMPANY_COOKIE, createSession, getUser, requireSuper } from '@/lib/session'
import { isBizNo, isPin, isUuid, line, normalizePhone, optLine, optStr, str, weakPin } from '@/lib/validate'
import { bizNoFmt } from '@/lib/members'
import { sendAdminPush, sendPush, superAdminIds } from '@/lib/push'
import { caughtByHoneypot, ipKey, overLimit } from '@/lib/ratelimit'
import type { FormState } from './auth'

function back(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(msg)}`)
}

/** 회사를 바꾼 뒤 돌아갈 수 있는 관리자 화면 (정해 둔 목록만 — 다른 주소로는 보내지 않음) */
const SECTIONS = ['jobs', 'workers', 'chat', 'reports', 'vendors', 'docs', 'settings', 'companies', 'community']
/** 보고 있던 화면의 같은 메뉴로 (공고 하나·근무자 한 명처럼 회사마다 다른 화면이면 그 목록으로) */
function switchTarget(path: string): string {
  // 새 공고 화면은 회사마다 같은 화면이라 그대로 (다른 회사로 올리려던 것을 알아채고 위에서 바꾼 경우 — 공고 목록으로 나가지 않게)
  if (path === '/admin/jobs/new') return path
  const seg = /^\/admin\/([a-z]+)(?:[/?#]|$)/.exec(path)?.[1]
  return seg && SECTIONS.includes(seg) ? `/admin/${seg}` : '/admin'
}

/**
 * 회사를 바꾸면서 바로 열 화면: 그 회사의 공고·단체방·문의 대화·견적 요청 주소일 때만 (알림·공유 링크로 다른 회사 것을 열었을 때).
 * 주소 모양이 다르거나 그 회사 것이 아니면 null → 평소처럼 메뉴 목록으로
 */
const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const OPEN_JOB = new RegExp(`^/admin/(?:jobs|chat/room)/(${ID})(?:\\?[A-Za-z0-9=&_.-]{1,120})?$`)
const OPEN_THREAD = new RegExp(`^/admin/chat/(${ID})$`)
const OPEN_REQUEST = new RegExp(`^/admin/vendors/requests/(${ID})$`)
async function openTarget(path: string, companyId: string): Promise<string | null> {
  const jobId = OPEN_JOB.exec(path)?.[1]
  if (jobId) {
    const { data } = await db().from('jobs').select('company_id').eq('id', jobId).maybeSingle()
    return (data as { company_id: string } | null)?.company_id === companyId ? path : null
  }
  // 외주 견적 요청: 그 회사 요청일 때만
  const reqId = OPEN_REQUEST.exec(path)?.[1]
  if (reqId) {
    const { data } = await db().from('quote_requests').select('company_id').eq('id', reqId).maybeSingle()
    return (data as { company_id: string } | null)?.company_id === companyId ? path : null
  }
  // 문의 대화: 그 회사와 주고받은 글이 있는 사람일 때만
  const userId = OPEN_THREAD.exec(path)?.[1]
  if (userId) {
    const { count } = await db().from('messages').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('thread_user_id', userId)
    return count ? path : null
  }
  return null
}

/** 관리자 화면에서 볼 회사 바꾸기 (들어갈 수 있는 회사만). 보던 메뉴에 그대로 남고, 어느 회사로 바꿨는지 안내 */
export async function switchCompany(form: FormData) {
  const companyId = str(form, 'company', 40)
  const user = await getUser()
  if (!user || user.role !== 'admin') redirect('/')
  const target = (await adminCompanies(user.id, user.isSuper)).find((c) => c.id === companyId)
  if (!target) back('/admin', '들어갈 수 없는 회사예요.')
  ;(await cookies()).set(COMPANY_COOKIE, companyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  const open = await openTarget(str(form, 'open', 300), companyId)
  back(open ?? switchTarget(str(form, 'back', 300)), `${target.name} 화면으로 바꿨어요`)
}

/**
 * 회사 직접 가입: 회사 정보 + 담당자(관리자) 계정을 만들고 바로 관리자 화면으로.
 * 공고·지원·출퇴근·서류·정산은 바로 쓰고, 해피워크 전체 회원 명단은 최고 관리자가 '확인'한 뒤에 열림 (verified=false로 시작).
 * 이미 로그인한 관리자는 회사만 더 만듦 (한 관리자가 여러 회사 운영)
 */
export async function signupCompany(_: FormState, form: FormData): Promise<FormState> {
  if (caughtByHoneypot(form)) return { error: '가입 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  // 한 곳에서 회사를 대량으로 만들지 못하게
  if (await overLimit(await ipKey('company-signup'), 5, 3600)) return { error: '가입 시도가 너무 많아요. 한 시간 뒤에 다시 시도해 주세요.' }
  const user = await getUser()
  if (user && user.role !== 'admin') {
    return { error: '근무자 계정으로는 회사를 만들 수 없어요. 로그아웃한 뒤 회사 담당자 번호로 가입해 주세요.' }
  }
  const company_name = line(form, 'company_name', 100)
  const bizNo = str(form, 'business_no', 20).replace(/\D/g, '')
  const ceo_name = line(form, 'ceo_name', 30)
  if (company_name.length < 2) return { error: '회사 이름(상호)을 입력해 주세요.' }
  if (!isBizNo(bizNo)) return { error: '사업자등록번호 10자리를 정확히 입력해 주세요. (사업자등록증에 적힌 번호)' }
  if (ceo_name.length < 2) return { error: '대표자 이름을 입력해 주세요.' }
  // 같은 사업자등록번호의 회사가 이미 있으면 막음 (다른 사람이 그 회사인 척 가입하지 못하게)
  const { data: others } = await db().from('companies').select('business_no')
  if (((others ?? []) as { business_no: string | null }[]).some((c) => (c.business_no ?? '').replace(/\D/g, '') === bizNo)) {
    return { error: '이미 해피워크를 쓰는 사업자등록번호예요. 그 회사 대표 관리자에게 회사 코드를 받아 \'기존 회사에 합류\'로 가입해 주세요.' }
  }

  let userId: string
  let version: number | null = null
  let contactName: string
  let contactPhone: string
  if (user) {
    userId = user.id
    contactName = user.name
    contactPhone = user.phone
  } else {
    const name = line(form, 'name', 30)
    const phone = normalizePhone(str(form, 'phone'))
    const pin = str(form, 'pin')
    if (name.length < 2) return { error: '담당자 이름을 입력해 주세요.' }
    if (!phone) return { error: '휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)' }
    if (!isPin(pin)) return { error: '비밀번호는 숫자 6자리로 정해 주세요.' }
    if (pin !== str(form, 'pin2')) return { error: '비밀번호 확인이 일치하지 않습니다.' }
    const weak = weakPin(pin, { phone })
    if (weak) return { error: weak }
    if (form.get('agree_privacy') !== 'on') return { error: '필수 동의 항목에 체크해 주세요.' }
    const { data: byPhone } = await db().from('users').select('id').eq('phone', phone).maybeSingle()
    if (byPhone) return { error: '이미 가입된 휴대폰 번호예요. 로그인한 뒤 다시 \'회사로 시작하기\'를 눌러 주세요.', code: 'dup_phone' }
    const created = must(
      await db()
        .from('users')
        .insert({ role: 'admin', name, phone, pin_hash: await hashPin(pin), privacy_agreed_at: new Date().toISOString() })
        .select('id, session_version')
        .single(),
    ) as { id: string; session_version: number }
    userId = created.id
    version = created.session_version
    contactName = name
    contactPhone = phone
  }

  const created = must(
    await db()
      .from('companies')
      .insert({
        company_name,
        ceo_name,
        business_no: bizNoFmt(bizNo),
        contact_name: contactName,
        contact_phone: contactPhone,
        default_hourly_wage: MIN_WAGE_2026,
        workplace_5plus: true,
        active: true,
        // 최고 관리자가 만든 회사는 바로 확인된 회사
        verified: !!user?.isSuper,
      })
      .select('id')
      .single(),
  ) as { id: string }
  const id = created.id
  must(await db().from('doc_templates').insert(DEFAULT_TEMPLATES.map((t) => ({ ...t, company_id: id }))))
  must(await db().from('company_members').insert({ company_id: id, user_id: userId, role: 'owner' }))
  await audit(userId, 'company.signup', null, `${company_name} ${bizNoFmt(bizNo)}`, id)
  after(async () =>
    sendPush(await superAdminIds(), {
      title: '🏢 새 회사가 가입했어요',
      body: `${company_name} · 대표 ${ceo_name} · 담당 ${contactName}`,
      url: '/admin/companies',
    }),
  )
  ;(await cookies()).set(COMPANY_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 })
  if (version !== null) await createSession(userId, version, 'admin')
  redirect(`/admin?m=${encodeURIComponent(`${company_name}로 시작했어요! 회사 설정에서 주소·직인을 채우고 첫 공고를 올려 보세요.`)}`)
}

/** 회사 만들기 (최고 관리자만): 기본 서류 서식을 함께 넣고, 만든 사람을 대표 관리자로 */
export async function createCompany(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireSuper()
  const company_name = line(form, 'company_name', 100)
  if (company_name.length < 2) return { error: '회사 이름(상호)을 입력해 주세요.' }
  const { data, error } = await db()
    .from('companies')
    .insert({
      company_name,
      ceo_name: optLine(form, 'ceo_name', 30),
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
  const { data: existing } = await db().from('users').select('id, name, role, active, session_version').eq('phone', phone).maybeSingle()
  let userId: string
  let temp: string | null = null
  let name: string
  if (existing) {
    if (!existing.active) return { error: '로그인이 정지된 계정이에요. 먼저 정지를 풀어 주세요.' }
    userId = existing.id
    name = existing.name
    // 권한이 바뀌면 다시 로그인하게 (근무자 로그인이 관리자 권한으로 이어지지 않게)
    if (existing.role !== 'admin') must(await db().from('users').update({ role: 'admin', session_version: existing.session_version + 1 }).eq('id', userId))
  } else {
    name = line(form, 'name', 30)
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
    db().from('users').select('is_super, session_version').eq('id', userId).maybeSingle(),
  ])
  if (!left && !u?.is_super) must(await db().from('users').update({ role: 'worker', session_version: (u?.session_version ?? 0) + 1 }).eq('id', userId))
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

/** 직접 가입한 회사 확인 (최고 관리자만): 확인하면 해피워크 전체 회원 명단·번호로 직접 추가가 열림 */
export async function setCompanyVerified(companyId: string, verified: boolean, form?: FormData) {
  const admin = await requireSuper()
  if (!isUuid(companyId)) return
  // 확인 전 → 확인으로 바뀔 때만 그 회사에 알림 (이미 확인한 회사를 또 눌러도 알림이 다시 가지 않게)
  const { data: before } = await db().from('companies').select('verified').eq('id', companyId).maybeSingle()
  const wasVerified = (before as { verified?: boolean | null } | null)?.verified === true
  must(await db().from('companies').update({ verified }).eq('id', companyId))
  await audit(admin.id, verified ? 'company.verify' : 'company.unverify', null, null, companyId)
  if (verified && !wasVerified) {
    // 그 회사 관리자에게: 확인이 끝나 전체 회원 명단·번호로 직접 추가가 열렸어요 (기다리는 동안 화면을 계속 열어 보지 않아도 되게)
    after(() =>
      sendAdminPush(companyId, {
        title: '✅ 회사 확인이 끝났어요',
        body: '이제 해피워크 전체 회원 명단에서 근무자를 찾고, 번호로 바로 추가할 수 있어요.',
        url: '/admin/workers',
        tag: `verified-${companyId}`,
      }),
    )
  }
  revalidatePath('/admin/companies')
  revalidatePath('/ops')
  // 운영 센터에서 눌렀으면 운영 센터로 돌아감 (그 밖은 회사 관리)
  const to = form instanceof FormData && form.get('back') === '/ops' ? '/ops' : '/admin/companies'
  back(to, verified ? '회사를 확인했어요. 이제 전체 회원 명단이 열려요.' : '확인을 취소했어요. 다시 우리 회사 지원자만 보여요.')
}
