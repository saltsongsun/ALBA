'use server'

import { timingSafeEqual } from 'node:crypto'
import { redirect } from 'next/navigation'
import { blindIndex, encrypt, hashPin, verifyPin } from '@/lib/crypto'
import { db, must } from '@/lib/db'
import { DEFAULT_TEMPLATES } from '@/lib/default-templates'
import { photoBase64 } from '@/lib/photo'
import { createSession, destroySession } from '@/lib/session'
import { ageOn } from '@/lib/time'
import { isPin, normalizePhone, optStr, parseRrn, safePath, str } from '@/lib/validate'

export type FormState = { error?: string; ok?: string } | null

const LOCK_AFTER = 5
const LOCK_MINUTES = 10

const safeNext = (next: string, fallback: string) => safePath(next, fallback)

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const name = str(form, 'name', 30)
  const phone = normalizePhone(str(form, 'phone'))
  const rrn = parseRrn(str(form, 'rrn1') + str(form, 'rrn2'))
  const pin = str(form, 'pin')

  if (name.length < 2) return { error: '이름을 정확히 입력해 주세요.' }
  // 현장에서 담당자가 알아볼 수 있게 얼굴 사진 필수
  const photo = photoBase64(form.get('photo'))
  if (!photo) {
    return { error: form.get('photo') ? '사진을 올리지 못했어요. 다른 사진으로 다시 골라 주세요.' : '얼굴 사진을 찍거나 골라 주세요.' }
  }
  if (!rrn) return { error: '주민등록번호 13자리를 정확히 입력해 주세요.' }
  if (!phone) return { error: '휴대폰 번호를 정확히 입력해 주세요. (예: 010-1234-5678)' }
  if (!isPin(pin)) return { error: '비밀번호는 숫자 6자리로 정해 주세요.' }
  if (pin !== str(form, 'pin2')) return { error: '비밀번호 확인이 일치하지 않습니다.' }
  if (form.get('agree_privacy') !== 'on' || form.get('agree_rrn') !== 'on') {
    return { error: '필수 동의 항목에 모두 체크해 주세요.' }
  }
  if (ageOn(rrn.birthDate) < 15) {
    return { error: '만 15세 미만은 가입할 수 없습니다. (근로기준법 제64조)' }
  }

  const rrnHash = blindIndex(rrn.digits)
  const [{ data: byPhone }, { data: byRrn }] = await Promise.all([
    db().from('users').select('id').eq('phone', phone).maybeSingle(),
    db().from('users').select('id').eq('rrn_hash', rrnHash).maybeSingle(),
  ])
  if (byPhone) return { error: '이미 가입된 휴대폰 번호입니다. 로그인해 주세요.' }
  if (byRrn) {
    return { error: '이미 가입된 주민등록번호입니다. 예전에 쓰던 번호로 로그인하거나 담당자에게 문의해 주세요.' }
  }

  const account = str(form, 'bank_account', 40).replace(/[^\d-]/g, '')
  const { data, error } = await db()
    .from('users')
    .insert({
      name,
      phone,
      pin_hash: await hashPin(pin),
      rrn_enc: encrypt(rrn.digits),
      rrn_hash: rrnHash,
      rrn_masked: rrn.masked,
      birth_date: rrn.birthDate,
      gender: rrn.gender,
      is_foreigner: rrn.isForeigner,
      address: optStr(form, 'address', 200),
      bank_name: account ? optStr(form, 'bank_name', 30) : null,
      bank_account_enc: account ? encrypt(account) : null,
      account_holder: account ? optStr(form, 'account_holder', 30) || name : null,
      privacy_agreed_at: new Date().toISOString(),
      photo_at: new Date().toISOString(),
    })
    .select('id, session_version, photo_at')
    .single()
  if (error || !data) return { error: '가입 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  const { error: photoError } = await db()
    .from('user_photos')
    .insert({ user_id: data.id, data: photo, updated_at: data.photo_at, updated_by: data.id })
  // 사진만 실패하면 가입은 그대로 두고 나중에 내 정보에서 올리게 (내 근무 화면에 안내가 뜸)
  if (photoError) await db().from('users').update({ photo_at: null }).eq('id', data.id)

  await createSession(data.id, data.session_version)
  redirect(safeNext(str(form, 'next'), '/me'))
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const phone = normalizePhone(str(form, 'phone'))
  const pin = str(form, 'pin')
  if (!phone || !pin) return { error: '휴대폰 번호와 비밀번호를 입력해 주세요.' }

  const { data: u } = await db()
    .from('users')
    .select('id, role, pin_hash, active, failed_logins, locked_until, session_version')
    .eq('phone', phone)
    .maybeSingle()
  if (!u || !u.active) return { error: '휴대폰 번호 또는 비밀번호가 맞지 않습니다.' }

  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60_000)
    return { error: `비밀번호를 ${LOCK_AFTER}회 틀려 잠겼습니다. ${mins}분 뒤에 다시 시도해 주세요.` }
  }

  if (!(await verifyPin(pin, u.pin_hash))) {
    const fails = u.failed_logins + 1
    const lock = fails >= LOCK_AFTER
    await db()
      .from('users')
      .update({
        failed_logins: lock ? 0 : fails,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq('id', u.id)
    return {
      error: lock
        ? `비밀번호를 ${LOCK_AFTER}회 틀려 ${LOCK_MINUTES}분간 로그인이 잠겼습니다.`
        : `휴대폰 번호 또는 비밀번호가 맞지 않습니다. (${fails}/${LOCK_AFTER})`,
    }
  }

  if (u.failed_logins || u.locked_until) {
    await db().from('users').update({ failed_logins: 0, locked_until: null }).eq('id', u.id)
  }
  await createSession(u.id, u.session_version)
  redirect(safeNext(str(form, 'next'), u.role === 'admin' ? '/admin' : '/me'))
}

export async function logout() {
  await destroySession()
  redirect('/')
}

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** 관리자가 한 명도 없을 때만 동작하는 첫 관리자 등록 */
export async function setupAdmin(_: FormState, form: FormData): Promise<FormState> {
  const code = process.env.ADMIN_SETUP_CODE
  if (!code) return { error: 'ADMIN_SETUP_CODE 환경변수가 설정되지 않았습니다.' }
  const { count } = await db().from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin')
  if ((count ?? 0) > 0) return { error: '이미 관리자 계정이 있습니다. 기존 관리자에게 권한을 요청해 주세요.' }
  if (!sameCode(str(form, 'code'), code)) return { error: '설치 코드가 맞지 않습니다.' }

  const name = str(form, 'name', 30)
  const phone = normalizePhone(str(form, 'phone'))
  const pin = str(form, 'pin')
  if (name.length < 2) return { error: '이름을 입력해 주세요.' }
  if (!phone) return { error: '휴대폰 번호를 정확히 입력해 주세요.' }
  if (!isPin(pin)) return { error: '비밀번호는 숫자 6자리로 정해 주세요.' }

  const { data: existing } = await db()
    .from('users')
    .select('id, pin_hash, session_version')
    .eq('phone', phone)
    .maybeSingle()
  let userId: string
  let version: number
  if (existing) {
    if (!(await verifyPin(pin, existing.pin_hash))) {
      return { error: '이미 가입된 번호입니다. 그 계정의 비밀번호를 입력하면 관리자로 전환됩니다.' }
    }
    must(await db().from('users').update({ role: 'admin' }).eq('id', existing.id))
    userId = existing.id
    version = existing.session_version
  } else {
    const created = must(
      await db()
        .from('users')
        .insert({ role: 'admin', name, phone, pin_hash: await hashPin(pin), privacy_agreed_at: new Date().toISOString() })
        .select('id, session_version')
        .single(),
    ) as { id: string; session_version: number }
    userId = created.id
    version = created.session_version
  }

  const { count: tplCount } = await db().from('doc_templates').select('id', { count: 'exact', head: true })
  if (!tplCount) must(await db().from('doc_templates').insert(DEFAULT_TEMPLATES))

  await createSession(userId, version)
  redirect('/admin')
}
