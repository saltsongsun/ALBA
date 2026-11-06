'use client'

import AccountDigits from './AccountDigits'
import BizNoField from './BizNoField'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'
import { login, setupAdmin, signup } from '@/app/actions/auth'
import { signupCompany } from '@/app/actions/company'
import { requestJoin } from '@/app/actions/team'
import { BANKS, PRIVACY_ITEMS, RRN_NOTICE, THIRD_PARTY_ITEMS, THIRD_PARTY_ITEMS_VENDOR } from '@/lib/privacy'
import { PhotoField } from './PhotoUpload'
import { FormMessage, keepInputs, SubmitButton } from './ui'
import CareerEditor from './CareerEditor'
import SignupProgress from './SignupProgress'
import { MEMBER_TYPES, SPECIALTIES } from '@/lib/members'
import { parseRrn, weakPin } from '@/lib/validate'
import type { MemberType } from '@/lib/types'

const digitsOnly = (e: React.FormEvent<HTMLInputElement>) => {
  const el = e.currentTarget
  el.value = el.value.replace(/\D/g, '')
}

/** 숫자만 남기고, 칸을 다 채우면 data-next 칸으로 넘어감 (주민번호 앞→뒤, 비밀번호→확인) */
const digitsThenNext = (e: React.FormEvent<HTMLInputElement>) => {
  digitsOnly(e)
  const el = e.currentTarget
  if (el.dataset.next && el.value.length === el.maxLength) (el.form?.elements.namedItem(el.dataset.next) as HTMLElement | null)?.focus()
}

/** 휴대폰 번호를 010-1234-5678 꼴로 (끝에서 입력할 때만 바꿔 커서가 튀지 않게) */
const formatPhone = (e: React.FormEvent<HTMLInputElement>) => {
  const el = e.currentTarget
  if (el.selectionStart !== el.value.length) return
  const d = el.value.replace(/\D/g, '').slice(0, 11)
  el.value = d.length < 4 ? d : d.length < 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

/** 봇 함정 칸: 사람에게는 안 보이고, 자동 입력 봇만 채움 (채워지면 서버가 거절) */
function Honeypot() {
  return (
    <div aria-hidden className="sr-only">
      <label>
        웹사이트
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  )
}

/** 비밀번호 보기·숨기기 (같은 폼의 비밀번호 칸을 함께). 6자리를 잘못 눌렀는지 확인하게 */
function PinReveal({ names }: { names: string[] }) {
  const [shown, setShown] = useState(false)
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form
    const next = !shown
    for (const n of names) {
      const el = form?.elements.namedItem(n)
      if (el instanceof HTMLInputElement) el.type = next ? 'text' : 'password'
    }
    setShown(next)
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={shown} className="mt-1.5 text-xs font-semibold text-sub">
      {shown ? '🙈 비밀번호 숨기기' : '👁 비밀번호 보기'}
    </button>
  )
}

/** 가입하다 '이미 가입된 번호'가 나오면 그 번호를 로그인 화면으로 넘김 (주소에 번호를 남기지 않게 이 탭 저장소로) */
const LOGIN_PHONE_KEY = 'login-phone'

/** 가입 화면: 이미 가입된 휴대폰 번호면 그 번호가 채워진 로그인 화면으로 (다시 입력하지 않게) */
function LoginWithPhone({ next }: { next: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      className="btn-primary w-full animate-pop py-3.5 text-base"
      onClick={(e) => {
        const phone = (e.currentTarget.form?.elements.namedItem('phone') as HTMLInputElement | null)?.value ?? ''
        try {
          sessionStorage.setItem(LOGIN_PHONE_KEY, phone)
        } catch {}
        router.push(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`)
      }}
    >
      이 번호로 로그인하기 →
    </button>
  )
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(login, null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const [filled, setFilled] = useState(false)
  // 가입 화면에서 넘어온 번호를 채우고 비밀번호 칸으로
  useEffect(() => {
    let phone: string | null = null
    try {
      phone = sessionStorage.getItem(LOGIN_PHONE_KEY)
      sessionStorage.removeItem(LOGIN_PHONE_KEY)
    } catch {}
    if (!phone || !phoneRef.current) return
    phoneRef.current.value = phone
    setFilled(true)
    pinRef.current?.focus()
  }, [])
  return (
    <form action={action} onReset={keepInputs} className="space-y-4">
      <Honeypot />
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="phone">
          휴대폰 번호
        </label>
        <input ref={phoneRef} id="phone" name="phone" className="input" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" maxLength={13} onInput={formatPhone} required />
        {filled && <p className="mt-1.5 text-sm font-medium text-emerald-700">✓ 가입된 번호를 채웠어요</p>}
      </div>
      <div>
        <label className="label" htmlFor="pin">
          비밀번호 (숫자 6자리)
        </label>
        <input
          ref={pinRef}
          id="pin"
          name="pin"
          type="password"
          className="input tracking-[0.3em]"
          inputMode="numeric"
          maxLength={6}
          autoComplete="current-password"
          onInput={digitsOnly}
          required
        />
        <PinReveal names={['pin']} />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3.5 text-base">로그인</SubmitButton>
      <p className="text-center text-sm text-mute">
        처음이신가요?{' '}
        <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-600">
          1분 만에 가입하기
        </Link>
      </p>
    </form>
  )
}

/** 가입 유형 고르기: 아르바이트 / 전문가 / 외주 업체 (고르면 그 유형의 가입 화면으로) */
export function SignupTypePicker({ next }: { next: string }) {
  const q = next ? `&next=${encodeURIComponent(next)}` : ''
  return (
    <div className="stagger space-y-3">
      {(['worker', 'expert', 'vendor'] as const).map((t) => {
        const m = MEMBER_TYPES[t]
        return (
          <Link
            key={t}
            href={`/signup?type=${t}${q}`}
            data-mode={t === 'worker' ? undefined : 'pro'}
            className={`card-link flex items-center gap-4 p-5 ${t === 'worker' ? '' : 'ring-1 ring-brand-100'}`}
          >
            <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-3xl">
              {m.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-extrabold">{m.label}</span>
              <span className="mt-0.5 block text-sm text-sub">{m.desc}</span>
            </span>
            <span aria-hidden className="shrink-0 text-xl font-bold text-brand-600">
              ›
            </span>
          </Link>
        )
      })}
      {/* 사람을 뽑는 회사는 회사로 가입, 회사 직원은 회사 코드로 관리자 가입 */}
      <div className="space-y-1.5 pt-2 text-center text-sm font-semibold text-sub">
        <Link href="/start" className="block">
          🏢 사람을 뽑는 회사인가요? <span className="text-brand-600">회사로 시작하기 →</span>
        </Link>
        <Link href="/start?tab=join" className="block">
          🧑‍💼 회사 코드가 있나요? <span className="text-brand-600">관리자로 가입 →</span>
        </Link>
      </div>
    </div>
  )
}

/** 전문 분야 고르기 (여러 개) → hidden specialty에 쉼표로 */
function SpecialtyPicker() {
  const [picked, setPicked] = useState<string[]>([])
  return (
    <div>
      <span className="label">전문 분야 (여러 개 고를 수 있어요)</span>
      <div className="flex flex-wrap gap-1.5">
        {SPECIALTIES.map((sp) => {
          const on = picked.includes(sp)
          return (
            <button
              key={sp}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== sp) : [...p, sp]))}
              className={on ? 'chip-primary' : 'chip'}
            >
              {sp}
            </button>
          )
        })}
      </div>
      <input type="hidden" name="specialty" value={picked.join(',')} />
    </div>
  )
}

const PERSON_REQUIRED: [string, string][] = [
  ['photo', '사진'],
  ['name', '이름'],
  ['rrn2', '주민번호'],
  ['phone', '휴대폰'],
  ['pin2', '비밀번호'],
  ['agree_privacy', '개인정보 동의'],
  ['agree_third', '제3자 제공 동의'],
  ['agree_rrn', '주민번호 동의'],
]
const VENDOR_REQUIRED: [string, string][] = [
  ['biz_name', '상호'],
  ['biz_no', '사업자번호'],
  ['name', '담당자'],
  ['phone', '휴대폰'],
  ['pin2', '비밀번호'],
  ['agree_privacy', '개인정보 동의'],
  ['agree_third', '제3자 제공 동의'],
]

/** 얼굴 사진 칸이 있는 가입 폼: 사진 없이 제출하면 서버로 보내지 않고 사진 칸으로 (칸이 화면 위쪽이라 아래 오류 문구로는 찾기 어려움) */
const needPhotoFirst = (e: React.FormEvent<HTMLFormElement>) => {
  const field = e.currentTarget.querySelector('[data-photo-field]')
  const photo = e.currentTarget.elements.namedItem('photo')
  if (!field || !(photo instanceof HTMLInputElement) || photo.value) return
  e.preventDefault()
  field.dispatchEvent(new Event('need-photo'))
}

/** 생년월일 후보 (주민번호 앞자리 + 뒷자리 첫 숫자로 세기 · 뒷자리가 아직 없으면 1900·2000년대 둘 다) */
function birthCandidates(rrn1: string, rrn2: string): string[] {
  if (!/^\d{6}$/.test(rrn1)) return []
  const yy = rrn1.slice(0, 2)
  const md = `${rrn1.slice(2, 4)}-${rrn1.slice(4, 6)}`
  const g = Number(rrn2[0])
  if ([1, 2, 5, 6].includes(g)) return [`19${yy}-${md}`]
  if ([3, 4, 7, 8].includes(g)) return [`20${yy}-${md}`]
  return [`19${yy}-${md}`, `20${yy}-${md}`]
}

type RrnHint = { ok: boolean; text: string; at?: 'rrn1' | 'rrn2' }

/** 날짜로 맞는지 (YYMMDD + 세기) */
function realDate(yymmdd: string, century: number): boolean {
  const y = century + Number(yymmdd.slice(0, 2))
  const m = Number(yymmdd.slice(2, 4))
  const d = Number(yymmdd.slice(4, 6))
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/**
 * 주민번호 칸을 쓰는 동안 바로 확인 (done: 다 쓴 뒤 — 칸을 벗어났거나 가입을 누름)
 * 서버도 같은 규칙(parseRrn)으로 한 번 더 막음
 */
function rrnHint(r1: string, r2: string, done: boolean): RrnHint | null {
  const front = { ok: false, text: '앞 6자리는 생년월일이에요 (예: 990315)', at: 'rrn1' as const }
  if (r1.length < 6) return done ? { ok: false, text: '앞자리 생년월일 6자리를 넣어 주세요', at: 'rrn1' } : null
  const g = r2 ? Number(r2[0]) : 0
  if (r2 && ![1, 2, 3, 4, 5, 6, 7, 8].includes(g)) return { ok: false, text: '뒷자리 첫 숫자는 1~8 중 하나예요. 다시 확인해 주세요', at: 'rrn2' }
  const centuries = !g ? [1900, 2000] : [1, 2, 5, 6].includes(g) ? [1900] : [2000]
  if (!centuries.some((c) => realDate(r1, c))) return front
  if (r2.length < 7) return done ? { ok: false, text: '뒷자리 7자리를 모두 넣어 주세요', at: 'rrn2' } : null
  const p = parseRrn(r1 + r2)
  if (!p) return { ok: false, text: '주민등록번호를 다시 확인해 주세요', at: 'rrn1' }
  const [y, m, d] = p.birthDate.split('-').map(Number)
  return { ok: true, text: `${y}년 ${m}월 ${d}일생` }
}

/**
 * 주민등록번호 앞·뒤 칸 (아르바이트·전문가 가입).
 * 틀린 곳을 '가입하기' 전에 그 칸 아래에서 바로 알려 주고, 그래도 틀린 채 누르면 서버로 보내지 않고 그 칸으로
 * (인사이트: '주민등록번호 13자리를 정확히 입력해 주세요'를 가입을 누른 뒤에야 보고 같은 칸을 여러 번 누름)
 */
function RrnFields({ note }: { note: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hint, setHint] = useState<RrnHint | null>(null)
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const input = (n: 'rrn1' | 'rrn2') => form.elements.namedItem(n) as HTMLInputElement | null
    const digits = (n: 'rrn1' | 'rrn2') => (input(n)?.value ?? '').replace(/\D/g, '')
    let done = false
    const check = () => setHint(rrnHint(digits('rrn1'), digits('rrn2'), done))
    const onInput = (e: Event) => {
      const name = (e.target as HTMLInputElement | null)?.name
      if (name === 'rrn1' || name === 'rrn2') check()
    }
    const onLeave = (e: FocusEvent) => {
      const from = (e.target as HTMLInputElement | null)?.name
      const to = (e.relatedTarget as HTMLInputElement | null)?.name
      // 앞칸 → 뒷칸으로 옮겨 가는 건 아직 쓰는 중
      if ((from === 'rrn1' || from === 'rrn2') && to !== 'rrn1' && to !== 'rrn2') {
        done = true
        check()
      }
    }
    const onSubmit = (e: SubmitEvent) => {
      // 얼굴 사진이 없으면 사진 칸(위쪽)부터 — 그 안내는 사진 칸이 함
      const photo = form.elements.namedItem('photo')
      if (photo instanceof HTMLInputElement && !photo.value && form.querySelector('[data-photo-field]')) return
      done = true
      const h = rrnHint(digits('rrn1'), digits('rrn2'), true)
      setHint(h)
      if (!h || h.ok) return
      e.preventDefault()
      const el = input(h.at ?? 'rrn1')
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
    form.addEventListener('input', onInput)
    form.addEventListener('focusout', onLeave)
    form.addEventListener('submit', onSubmit)
    return () => {
      form.removeEventListener('input', onInput)
      form.removeEventListener('focusout', onLeave)
      form.removeEventListener('submit', onSubmit)
    }
  }, [])
  const bad = (n: 'rrn1' | 'rrn2') => (hint && !hint.ok && hint.at === n ? 'border-amber-400 ring-2 ring-amber-200' : '')
  return (
    <div ref={ref}>
      <label className="label" htmlFor="rrn1">주민등록번호</label>
      <div className="flex items-center gap-2">
        <input
          id="rrn1"
          name="rrn1"
          className={`input min-w-0 text-center ${bad('rrn1')}`}
          inputMode="numeric"
          maxLength={6}
          placeholder="앞 6자리"
          onInput={digitsThenNext}
          data-next="rrn2"
          aria-invalid={hint && !hint.ok && hint.at === 'rrn1' ? true : undefined}
          aria-describedby="rrn-hint"
          required
        />
        <span className="text-mute">-</span>
        <input
          name="rrn2"
          type="password"
          className={`input min-w-0 text-center tracking-widest ${bad('rrn2')}`}
          inputMode="numeric"
          maxLength={7}
          placeholder="뒤 7자리"
          autoComplete="off"
          onInput={digitsThenNext}
          data-next="phone"
          aria-invalid={hint && !hint.ok && hint.at === 'rrn2' ? true : undefined}
          aria-describedby="rrn-hint"
          aria-label="주민등록번호 뒤 7자리"
          required
        />
      </div>
      <p
        id="rrn-hint"
        aria-live="polite"
        data-rrn-hint={hint ? (hint.ok ? 'ok' : 'bad') : 'note'}
        className={hint ? `mt-1.5 text-xs font-semibold ${hint.ok ? 'text-emerald-700' : 'text-amber-700'}` : 'hint'}
      >
        {hint ? (hint.ok ? `✓ ${hint.text} · 암호화해서 보관해요` : hint.text) : note}
      </p>
    </div>
  )
}

/**
 * 비밀번호·확인 칸 (모든 유형 공통).
 * 쓸 수 없는 번호(생년월일·휴대폰 번호·123456 등)는 '가입하기'를 누르기 전에 바로 알려 줌
 * (인사이트: 가입을 누른 뒤에야 '생년월일로 된 비밀번호는 쓸 수 없어요'를 보고 다시 입력하는 사람이 있었음).
 * 확인은 이 휴대폰 안에서만 — 서버도 같은 규칙으로 한 번 더 막음
 */
function PinFields() {
  const ref = useRef<HTMLDivElement>(null)
  const [hint, setHint] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const val = (n: string) => {
      const el = form.elements.namedItem(n)
      return el instanceof HTMLInputElement ? el.value.replace(/\D/g, '') : ''
    }
    const check = () => {
      const pin = val('pin')
      const pin2 = val('pin2')
      if (pin.length < 6) return setHint(null)
      const phone = val('phone')
      const births = birthCandidates(val('rrn1'), val('rrn2'))
      const weak = (births.length ? births : [null]).map((b) => weakPin(pin, { birthDate: b, phone: phone.length >= 10 ? phone : null })).find(Boolean)
      if (weak) return setHint({ ok: false, text: weak })
      if (pin2.length === 6 && pin2 !== pin) return setHint({ ok: false, text: '비밀번호 확인이 달라요. 같은 번호를 한 번 더 넣어 주세요.' })
      setHint({ ok: true, text: pin2.length === 6 ? '쓸 수 있는 비밀번호예요 · 확인도 같아요' : '쓸 수 있는 비밀번호예요' })
    }
    form.addEventListener('input', check)
    return () => form.removeEventListener('input', check)
  }, [])
  return (
    <div ref={ref} className="space-y-1.5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pin">
            비밀번호
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            className={`input tracking-[0.3em] placeholder:tracking-normal ${hint && !hint.ok ? 'border-amber-400 ring-2 ring-amber-200' : ''}`}
            inputMode="numeric"
            maxLength={6}
            placeholder="숫자 6자리"
            autoComplete="new-password"
            onInput={digitsThenNext}
            data-next="pin2"
            aria-invalid={hint && !hint.ok ? true : undefined}
            aria-describedby="pin-hint"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="pin2">
            비밀번호 확인
          </label>
          <input id="pin2" name="pin2" type="password" className="input tracking-[0.3em]" inputMode="numeric" maxLength={6} autoComplete="new-password" onInput={digitsOnly} required />
          <PinReveal names={['pin', 'pin2']} />
        </div>
      </div>
      <p id="pin-hint" aria-live="polite" data-pin-hint={hint ? (hint.ok ? 'ok' : 'weak') : 'rule'} className={`text-xs ${hint ? (hint.ok ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700') : 'text-mute'}`}>
        {hint ? `${hint.ok ? '✓ ' : ''}${hint.text}` : '생년월일·휴대폰 번호·123456 같은 번호는 안 돼요'}
      </p>
    </div>
  )
}

/**
 * 가입 화면 (유형별로 다름)
 * · 아르바이트: 얼굴 사진·주민번호(급여 신고)·급여 계좌·행사 경력
 * · 전문가: 아르바이트와 같은 본인 정보 + 전문 분야·소개·포트폴리오 (사업소득 3.3% 신고에 주민번호 필요)
 * · 외주 업체: 상호·사업자등록번호·담당자 (주민번호·얼굴 사진 없음)
 */
/**
 * 필수 동의 한 번에: 누르면 이 칸 아래의 동의(agree_…)를 모두 체크/해제하고, 하나씩 바꿔도 맞춰 움직임.
 * 각 동의는 그대로 따로 보이고 따로 고칠 수 있음 (내용 보기도 그대로)
 */
function AgreeAll() {
  const ref = useRef<HTMLInputElement>(null)
  const boxes = () => [...(ref.current?.closest('section')?.querySelectorAll<HTMLInputElement>('input[type=checkbox][name^="agree_"]') ?? [])]
  useEffect(() => {
    const section = ref.current?.closest('section')
    if (!section) return
    const sync = () => {
      if (ref.current) ref.current.checked = boxes().every((b) => b.checked)
    }
    section.addEventListener('change', sync)
    return () => section.removeEventListener('change', sync)
  }, [])
  return (
    <label className="flex items-center gap-2.5 rounded-xl bg-brand-50 px-3.5 py-3 font-bold text-brand-800" data-agree-all>
      <input
        ref={ref}
        type="checkbox"
        className="size-5 shrink-0 accent-brand-600"
        onChange={(e) => {
          const on = e.currentTarget.checked
          for (const b of boxes()) {
            if (b.checked === on) continue
            b.checked = on
            // 위의 진행 막대(필수 n/7)도 바로 맞게
            b.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }}
      />
      필수 동의 모두 체크
    </label>
  )
}

/** 동의 내용 펼쳐 보기 */
function ConsentDetails({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <details className="rounded-xl bg-bg px-3.5 py-2.5 text-[13px] text-sub">
      <summary className="cursor-pointer font-semibold">내용 보기</summary>
      <dl className="mt-2 space-y-1.5">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="font-semibold text-ink">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

export function SignupForm({ next, type }: { next: string; type: MemberType }) {
  const [state, action] = useActionState(signup, null)
  const vendor = type === 'vendor'
  const pro = type !== 'worker'
  // 계좌번호 몇 자리인지 바로 보여 주려고 (칸 자체는 그대로 폼이 읽음)
  const [acct, setAcct] = useState('')
  return (
    <form action={action} onReset={keepInputs} onSubmit={needPhotoFirst} className="space-y-5">
      <Honeypot />
      <SignupProgress required={vendor ? VENDOR_REQUIRED : PERSON_REQUIRED} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="member_type" value={type} />
      {vendor ? (
        <section className="card space-y-4">
          <h2 className="font-bold">업체 정보 <span className="text-sm font-medium text-rose-500">필수</span></h2>
          <div>
            <label className="label" htmlFor="biz_name">
              상호
            </label>
            <input id="biz_name" name="biz_name" className="input" autoComplete="organization" placeholder="예) ○○음향" required />
          </div>
          <div>
            <label className="label" htmlFor="biz_no">
              사업자등록번호
            </label>
            <input id="biz_no" name="biz_no" className="input" inputMode="numeric" maxLength={12} placeholder="숫자 10자리" onInput={digitsOnly} required />
            <p className="hint">세금계산서·대금 지급에 쓰여요.</p>
          </div>
          <div>
            <label className="label" htmlFor="name">
              담당자 이름
            </label>
            <input id="name" name="name" className="input" autoComplete="name" placeholder="홍길동" required />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              담당자 휴대폰 번호
            </label>
            <input id="phone" name="phone" className="input" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" maxLength={13} onInput={formatPhone} required />
            <p className="hint">로그인 아이디로 쓰여요. 견적 요청 알림도 이 번호의 앱으로 와요.</p>
          </div>
          <PinFields />
        </section>
      ) : (
        <section className="card space-y-4">
          <h2 className="font-bold">기본 정보 <span className="text-sm font-medium text-rose-500">필수</span></h2>
          <div>
            <label className="label" htmlFor="name">
              이름
            </label>
            <input id="name" name="name" className="input" autoComplete="name" placeholder="홍길동" required />
          </div>
          <PhotoField />
          <RrnFields note={`${pro ? '용역 대금의 사업소득(3.3%) 신고에 필요해요.' : '임금 지급 시 세금·보험 신고에 필요해요.'} 암호화해서 보관해요.`} />
          <div>
            <label className="label" htmlFor="phone">
              휴대폰 번호
            </label>
            <input id="phone" name="phone" className="input" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" maxLength={13} onInput={formatPhone} required />
            <p className="hint">로그인 아이디로 쓰여요.</p>
          </div>
          <PinFields />
        </section>
      )}

      {pro && (
        <section className="card space-y-4">
          <h2 className="font-bold">
            {vendor ? '업체 소개' : '전문 분야'} <span className="text-sm font-medium text-mute">선택 · 담당자가 의뢰할 때 참고해요</span>
          </h2>
          <SpecialtyPicker />
          <input name="intro" className="input" maxLength={100} placeholder={vendor ? '한 줄 소개 (예: 행사 음향·조명 장비 임대·설치 10년)' : '한 줄 소개 (예: 공연·행사 음향 엔지니어 7년)'} />
          <input name="portfolio_url" className="input" inputMode="url" placeholder="포트폴리오·홈페이지 주소 (https://…)" />
        </section>
      )}

      <section className="card space-y-4">
        <h2 className="font-bold">
          {vendor ? '대금 받을 계좌' : pro ? '용역 대금 받을 계좌' : '급여 받을 계좌'} <span className="text-sm font-medium text-mute">선택 · 나중에 입력해도 돼요</span>
        </h2>
        {/* 칸마다 이름표 (값을 넣어도 무슨 칸인지 보이게) · 계좌번호는 쓰는 대로 몇 자리인지 */}
        <div className="grid grid-cols-[1fr_1.2fr] gap-3">
          <div className="min-w-0">
            <label className="label" htmlFor="bank_name">
              은행
            </label>
            <select id="bank_name" name="bank_name" className="input" defaultValue="">
              <option value="">은행 선택</option>
              {BANKS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="bank_account">
              계좌번호
            </label>
            <input id="bank_account" name="bank_account" className="input" inputMode="numeric" placeholder="숫자만" onInput={(e) => setAcct(e.currentTarget.value)} />
          </div>
        </div>
        <div className="-mt-2">
          <AccountDigits value={acct} fallback="계좌번호는 숫자 10~16자리예요" />
        </div>
        <div>
          <label className="label" htmlFor="account_holder">
            예금주
          </label>
          <input id="account_holder" name="account_holder" className="input" placeholder={vendor ? '비우면 상호' : '비우면 본인 이름'} />
        </div>
        {!vendor && (
          <div>
            <label className="label" htmlFor="address">
              주소 <span className="font-normal text-mute">(선택)</span>
            </label>
            <input id="address" name="address" className="input" placeholder="예) 진주시 남강로 123" autoComplete="street-address" />
          </div>
        )}
      </section>

      {!vendor && (
        <section className="card space-y-3">
          <h2 className="font-bold">
            {pro ? '참여한 행사·공연' : '행사 경력'} <span className="text-sm font-medium text-mute">선택 · 가입한 뒤에도 내 정보에서 고칠 수 있어요</span>
          </h2>
          <CareerEditor />
        </section>
      )}

      <section className="card space-y-3 text-sm">
        <div>
          <h2 className="font-bold">동의</h2>
          <p className="text-xs text-mute">해피워크 · 운영 주식회사 소켓씨앤씨</p>
        </div>
        <AgreeAll />
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="agree_privacy" className="mt-0.5 size-5 shrink-0 accent-brand-600" required />
          <span>
            <b>[필수]</b> 개인정보 수집·이용 동의
          </span>
        </label>
        <ConsentDetails items={PRIVACY_ITEMS} />
        {/* 지원·근무하는 회사(외주 업체는 거래 회사)에 제공: 수집·이용과 따로 동의 */}
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="agree_third" className="mt-0.5 size-5 shrink-0 accent-brand-600" required />
          <span>
            <b>[필수]</b> 개인정보 제3자 제공 동의
            <span className="block text-[13px] text-mute">{vendor ? '견적을 요청하는 회사에 제공' : '지원·근무하는 구인 회사에 제공'}</span>
          </span>
        </label>
        <ConsentDetails items={vendor ? THIRD_PARTY_ITEMS_VENDOR : THIRD_PARTY_ITEMS} />
        {!vendor && (
          <label className="flex items-start gap-2.5">
            <input type="checkbox" name="agree_rrn" className="mt-0.5 size-5 shrink-0 accent-brand-600" required />
            <span>
              <b>[필수]</b> 고유식별정보(주민등록번호) 처리 안내를 확인했습니다.
              <span className="mt-1 block text-[13px] text-mute">{RRN_NOTICE}</span>
            </span>
          </label>
        )}
      </section>

      <FormMessage state={state} />
      {state?.code === 'dup_phone' && <LoginWithPhone next={next} />}
      {state?.code === 'dup_rrn' && (
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="btn-primary w-full animate-pop py-3.5 text-base">
          로그인하러 가기 →
        </Link>
      )}
      {/* 이미 가입된 사람이면 로그인이 먼저 보이게 가입 버튼은 회색으로 */}
      <SubmitButton className={`${state?.code ? 'btn-gray' : 'btn-primary'} w-full py-3.5 text-base`} pendingText="가입 중…">
        {MEMBER_TYPES[type].label}로 가입하기
      </SubmitButton>
      <p className="text-center text-sm text-mute">
        이미 가입했나요?{' '}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-600">
          로그인
        </Link>
      </p>
    </form>
  )
}

/**
 * 회사로 시작하기: 회사 정보 + 담당자(관리자) 계정 → 바로 관리자 화면.
 * signedIn: 이미 로그인한 관리자면 회사 정보만 (한 관리자가 여러 회사 운영)
 */
export function CompanySignupForm({ signedIn }: { signedIn: boolean }) {
  const [state, action] = useActionState(signupCompany, null)
  return (
    <form action={action} onReset={keepInputs} className="space-y-5">
      <Honeypot />
      <section className="card space-y-4">
        <h2 className="font-bold">
          회사 정보 <span className="text-sm font-medium text-rose-500">필수</span>
        </h2>
        <div>
          <label className="label" htmlFor="company_name">
            회사 이름 (상호)
          </label>
          <input id="company_name" name="company_name" className="input" autoComplete="organization" placeholder="예) 주식회사 해피이벤트" required />
        </div>
        <div>
          <label className="label" htmlFor="business_no">
            사업자등록번호
          </label>
          {/* 쓰는 대로 맞는 번호인지 바로 (잘못 치면 가입 전에 알 수 있게) */}
          <BizNoField placeholder="숫자 10자리" required digits hint="사업자등록증의 번호예요. 계약서·명세서에 들어가요." />
        </div>
        <div>
          <label className="label" htmlFor="ceo_name">
            대표자 이름
          </label>
          <input id="ceo_name" name="ceo_name" className="input" placeholder="홍길동" required />
        </div>
      </section>

      {!signedIn && (
        <>
          <section className="card space-y-4">
            <h2 className="font-bold">
              담당자 (관리자 계정) <span className="text-sm font-medium text-rose-500">필수</span>
            </h2>
            <div>
              <label className="label" htmlFor="name">
                담당자 이름
              </label>
              <input id="name" name="name" className="input" autoComplete="name" placeholder="홍길동" required />
            </div>
            <div>
              <label className="label" htmlFor="phone">
                휴대폰 번호 (로그인할 때 써요)
              </label>
              <input id="phone" name="phone" className="input" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" maxLength={13} onInput={formatPhone} required />
            </div>
            <PinFields />
          </section>
          <section className="card space-y-3 text-sm">
            <h2 className="font-bold">동의</h2>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" name="agree_privacy" className="mt-0.5 size-5 shrink-0 accent-brand-600" required />
              <span>
                <b>[필수]</b> 담당자 개인정보 수집·이용에 동의합니다.
              </span>
            </label>
          </section>
        </>
      )}

      <FormMessage state={state} />
      {state?.code === 'dup_phone' && <LoginWithPhone next="/start" />}
      <SubmitButton className={`${state?.code ? 'btn-gray' : 'btn-primary'} w-full py-3.5 text-base`} pendingText="회사 만드는 중…">
        회사로 시작하기
      </SubmitButton>
      {!signedIn && (
        <p className="text-center text-sm text-mute">
          이미 관리자 계정이 있나요?{' '}
          <Link href="/login?next=/start" className="font-semibold text-brand-600">
            로그인
          </Link>
        </p>
      )}
    </form>
  )
}

/** 회사 코드 입력: 대문자로, 4자리마다 줄표 (ABCD-EFGH) */
function joinCodeInput(e: React.FormEvent<HTMLInputElement>) {
  const el = e.currentTarget
  const v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  el.value = v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v
}

/**
 * 기존 회사에 관리자로 가입 신청: 대표 관리자에게 받은 회사 코드 + (처음이면) 관리자 계정.
 * 대표 관리자가 승인하면 관리자 화면이 열림
 */
export function JoinCompanyForm({ signedIn, name, code, worker }: { signedIn: boolean; name?: string; code: string; worker: boolean }) {
  const [state, action] = useActionState(requestJoin, null)
  return (
    <form action={action} onReset={keepInputs} className="space-y-5">
      <Honeypot />
      <section className="card space-y-4">
        <h2 className="font-bold">
          회사 코드 <span className="text-sm font-medium text-rose-500">필수</span>
        </h2>
        <div>
          <label className="label" htmlFor="code">
            대표 관리자에게 받은 코드
          </label>
          <input
            id="code"
            name="code"
            defaultValue={code}
            className="input font-mono text-lg tracking-[0.2em] uppercase"
            placeholder="ABCD-EFGH"
            maxLength={9}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onInput={joinCodeInput}
            required
          />
          <p className="hint">대표 관리자의 회사 설정 화면에 있어요.</p>
        </div>
      </section>

      {signedIn ? (
        <div className="card space-y-1 text-sm">
          <p>
            <b>{name}</b>님 계정으로 신청해요.
          </p>
          {worker && <p className="font-semibold text-amber-700">관리자가 되면 이 번호로는 알바 지원을 할 수 없어요.</p>}
        </div>
      ) : (
        <>
          <section className="card space-y-4">
            <h2 className="font-bold">
              내 정보 (관리자 계정) <span className="text-sm font-medium text-rose-500">필수</span>
            </h2>
            <div>
              <label className="label" htmlFor="name">
                이름
              </label>
              <input id="name" name="name" className="input" autoComplete="name" placeholder="홍길동" required />
            </div>
            <div>
              <label className="label" htmlFor="phone">
                휴대폰 번호 (로그인할 때 써요)
              </label>
              <input id="phone" name="phone" className="input" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" maxLength={13} onInput={formatPhone} required />
            </div>
            <PinFields />
          </section>
          <section className="card space-y-3 text-sm">
            <h2 className="font-bold">동의</h2>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" name="agree_privacy" className="mt-0.5 size-5 shrink-0 accent-brand-600" required />
              <span>
                <b>[필수]</b> 개인정보 수집·이용 동의
              </span>
            </label>
          </section>
        </>
      )}

      <FormMessage state={state} />
      {state?.code === 'dup_phone' && <LoginWithPhone next="/start?tab=join" />}
      <SubmitButton className={`${state?.code ? 'btn-gray' : 'btn-primary'} w-full py-3.5 text-base`} pendingText="신청하는 중…">
        관리자 가입 신청
      </SubmitButton>
      {!signedIn && (
        <p className="text-center text-sm text-mute">
          이미 가입했나요?{' '}
          <Link href={`/login?next=${encodeURIComponent('/start?tab=join')}`} className="font-semibold text-brand-600">
            로그인
          </Link>
        </p>
      )}
    </form>
  )
}

export function SetupForm() {
  const [state, action] = useActionState(setupAdmin, null)
  return (
    <form action={action} onReset={keepInputs} className="card space-y-4">
      <div>
        <label className="label">설치 코드</label>
        <input name="code" className="input" placeholder="ADMIN_SETUP_CODE 값" required />
        <p className="hint">Vercel 환경변수에 넣은 ADMIN_SETUP_CODE 값입니다.</p>
      </div>
      <div>
        <label className="label">관리자 이름</label>
        <input name="name" className="input" required />
      </div>
      <div>
        <label className="label">휴대폰 번호 (로그인 아이디)</label>
        <input name="phone" className="input" inputMode="tel" required />
      </div>
      <div>
        <label className="label">비밀번호 (숫자 6자리)</label>
        <input name="pin" type="password" className="input" inputMode="numeric" maxLength={6} onInput={digitsOnly} required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full">관리자 계정 만들기</SubmitButton>
    </form>
  )
}
