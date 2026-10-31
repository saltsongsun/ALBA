'use server'

import { timingSafeEqual } from 'node:crypto'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { blindIndex, encrypt, hashPin, verifyPin } from '@/lib/crypto'
import { db, must } from '@/lib/db'
import { DEFAULT_TEMPLATES } from '@/lib/default-templates'
import { photoBase64 } from '@/lib/photo'
import { adminIds, sendPush } from '@/lib/push'
import { caughtByHoneypot, ipKey, note, overLimit, recent } from '@/lib/ratelimit'
import { createSession, destroySession } from '@/lib/session'
import { ageOn, minutesText } from '@/lib/time'
import { isPin, normalizePhone, optStr, parseRrn, safePath, str, weakPin } from '@/lib/validate'
import { parseCareers } from '@/lib/careers'

export type FormState = { error?: string; ok?: string } | null

const LOCK_AFTER = 5
const LOCK_MINUTES = 10
const MAX_LOCK_MINUTES = 24 * 60
// 한 IP에서 여러 계정을 돌아가며 맞혀 보는 공격 막기
const IP_FAIL_15M = 20
const IP_FAIL_DAY = 100
// 없는 번호로 로그인해도 걸리는 시간을 같게 (번호가 가입돼 있는지 알아내지 못하게)
const DUMMY_HASH = `s1:${'A'.repeat(22)}==:${'A'.repeat(43)}=`
const WRONG = '휴대폰 번호 또는 비밀번호가 맞지 않습니다. 여러 번 틀리면 잠시 잠겨요.'

/** n번째로 잠길 때마다 길게: 10분 → 30분 → 1시간 30분 … 최대 하루 */
const lockMinutes = (fails: number) => Math.min(MAX_LOCK_MINUTES, LOCK_MINUTES * 3 ** (Math.floor(fails / LOCK_AFTER) - 1))

/** 로그인 실패 기록. 전체 실패가 갑자기 늘면(자동화 공격 의심) 관리자에게 한 시간에 한 번 알림 */
async function noteLoginFail(ipBucket: string) {
  await note(ipBucket, 'login-fail:all')
  if ((await recent('login-fail:all', 600)) >= 100 && !(await overLimit('alert:login-surge', 1, 3600))) {
    after(async () =>
      sendPush(await adminIds(), {
        title: '🚨 로그인 실패 급증',
        body: '10분 사이 로그인 실패가 100번을 넘었어요. 자동화된 공격일 수 있어요. 잠긴 계정은 자동으로 풀립니다.',
        url: '/admin',
      }),
    )
  }
}

const safeNext = (next: string, fallback: string) => safePath(next, fallback)

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  if (caughtByHoneypot(form)) return { error: '가입 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  // 한 곳에서 계정을 대량으로 만들거나 주민번호 가입 여부를 대량으로 알아보지 못하게
  if (await overLimit(await ipKey('signup-try'), 20, 3600)) return { error: '가입 시도가 너무 많아요. 한 시간 뒤에 다시 시도해 주세요.' }
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
  const weak = weakPin(pin, { birthDate: rrn.birthDate, phone })
  if (weak) return { error: weak }
  if (form.get('agree_privacy') !== 'on' || form.get('agree_rrn') !== 'on') {
    return { error: '필수 동의 항목에 모두 체크해 주세요.' }
  }
  if (ageOn(rrn.birthDate) < 15) {
    return { error: '만 15세 미만은 가입할 수 없습니다. (근로기준법 제64조)' }
  }

  const rrnHash = blindIndex(rrn.digits)
  const dupKey = await ipKey('signup-dup')
  if ((await recent(dupKey, 3600)) >= 5) return { error: '가입 시도가 너무 많아요. 한 시간 뒤에 다시 시도하거나 담당자에게 문의해 주세요.' }
  const [{ data: byPhone }, { data: byRrn }] = await Promise.all([
    db().from('users').select('id').eq('phone', phone).maybeSingle(),
    db().from('users').select('id').eq('rrn_hash', rrnHash).maybeSingle(),
  ])
  if (byPhone || byRrn) await note(dupKey)
  if (byPhone) return { error: '이미 가입된 휴대폰 번호입니다. 로그인해 주세요.' }
  if (byRrn) {
    return { error: '이미 가입된 주민등록번호입니다. 예전에 쓰던 번호로 로그인하거나 담당자에게 문의해 주세요.' }
  }

  const careers = parseCareers(str(form, 'careers', 8000)) ?? []
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
      careers,
    })
    .select('id, session_version, photo_at')
    .single()
  if (error || !data) return { error: '가입 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }
  await note(await ipKey('signup-ok'))
  const { error: photoError } = await db()
    .from('user_photos')
    .insert({ user_id: data.id, data: photo, updated_at: data.photo_at, updated_by: data.id })
  // 사진만 실패하면 가입은 그대로 두고 나중에 내 정보에서 올리게 (내 근무 화면에 안내가 뜸)
  if (photoError) await db().from('users').update({ photo_at: null }).eq('id', data.id)

  await createSession(data.id, data.session_version)
  redirect(safeNext(str(form, 'next'), '/me'))
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  if (caughtByHoneypot(form)) return { error: WRONG }
  const phone = normalizePhone(str(form, 'phone'))
  const pin = str(form, 'pin')
  if (!phone || !pin) return { error: '휴대폰 번호와 비밀번호를 입력해 주세요.' }

  // 이 IP에서 실패가 너무 잦으면 (여러 계정을 돌아가며 맞혀 보는 자동화 공격) 잠시 막음
  const ipFail = await ipKey('login-fail')
  const [fail15, failDay] = await Promise.all([recent(ipFail, 15 * 60), recent(ipFail, 86_400)])
  if (fail15 >= IP_FAIL_15M || failDay >= IP_FAIL_DAY) {
    return { error: '로그인 시도가 너무 많아요. 잠시 뒤에 다시 시도하거나 담당자에게 비밀번호 초기화를 요청해 주세요.' }
  }

  const { data: u } = await db()
    .from('users')
    .select('id, role, pin_hash, active, failed_logins, locked_until, session_version')
    .eq('phone', phone)
    .maybeSingle()
  if (!u || !u.active) {
    await verifyPin(pin, DUMMY_HASH)
    await noteLoginFail(ipFail)
    return { error: WRONG }
  }

  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60_000)
    return { error: `비밀번호를 여러 번 틀려 잠겼습니다. ${minutesText(mins)} 뒤에 다시 시도해 주세요.` }
  }

  if (!(await verifyPin(pin, u.pin_hash))) {
    // 실패 횟수는 맞힐 때까지 쌓고, 5번마다 점점 길게 잠금
    const fails = u.failed_logins + 1
    const lock = fails % LOCK_AFTER === 0
    const mins = lockMinutes(fails)
    await db()
      .from('users')
      .update({
        failed_logins: fails,
        locked_until: lock ? new Date(Date.now() + mins * 60_000).toISOString() : null,
      })
      .eq('id', u.id)
    await noteLoginFail(ipFail)
    if (lock) {
      // 계정 주인에게 알림 (본인이 아니면 누군가 비밀번호를 맞혀 보는 중)
      after(() =>
        sendPush([u.id], {
          title: '🔒 내 계정 로그인이 잠겼어요',
          body: `비밀번호가 ${fails}번 틀려 ${minutesText(mins)} 동안 잠겼어요. 본인이 아니라면 로그인 뒤 '내 정보'에서 비밀번호를 바꿔 주세요.`,
          url: '/me/profile',
        }),
      )
      return { error: `비밀번호를 여러 번 틀려 ${minutesText(mins)} 동안 로그인이 잠겼습니다.` }
    }
    return { error: WRONG }
  }

  if (u.failed_logins || u.locked_until) {
    await db().from('users').update({ failed_logins: 0, locked_until: null }).eq('id', u.id)
  }
  await createSession(u.id, u.session_version, u.role)
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
  if (await overLimit(await ipKey('setup-try'), 10, 3600)) return { error: '시도가 너무 많아요. 한 시간 뒤에 다시 시도해 주세요.' }
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
    const weak = weakPin(pin, { phone })
    if (weak) return { error: weak }
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

  await createSession(userId, version, 'admin')
  redirect('/admin')
}
