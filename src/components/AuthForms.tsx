'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'
import { login, setupAdmin, signup } from '@/app/actions/auth'
import { BANKS, PRIVACY_ITEMS, RRN_NOTICE } from '@/lib/privacy'
import { PhotoField } from './PhotoUpload'
import { FormMessage, keepInputs, SubmitButton } from './ui'
import CareerEditor from './CareerEditor'
import SignupProgress from './SignupProgress'
import { MEMBER_TYPES, SPECIALTIES } from '@/lib/members'
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
  ['agree_rrn', '주민번호 동의'],
]
const VENDOR_REQUIRED: [string, string][] = [
  ['biz_name', '상호'],
  ['biz_no', '사업자번호'],
  ['name', '담당자'],
  ['phone', '휴대폰'],
  ['pin2', '비밀번호'],
  ['agree_privacy', '개인정보 동의'],
]

/** 비밀번호·확인 칸 (모든 유형 공통) */
function PinFields() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label" htmlFor="pin">
          비밀번호
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          className="input tracking-[0.3em]"
          inputMode="numeric"
          maxLength={6}
          placeholder="숫자 6자리"
          autoComplete="new-password"
          onInput={digitsThenNext}
          data-next="pin2"
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
  )
}

/**
 * 가입 화면 (유형별로 다름)
 * · 아르바이트: 얼굴 사진·주민번호(급여 신고)·급여 계좌·행사 경력
 * · 전문가: 아르바이트와 같은 본인 정보 + 전문 분야·소개·포트폴리오 (사업소득 3.3% 신고에 주민번호 필요)
 * · 외주 업체: 상호·사업자등록번호·담당자 (주민번호·얼굴 사진 없음)
 */
export function SignupForm({ next, type }: { next: string; type: MemberType }) {
  const [state, action] = useActionState(signup, null)
  const vendor = type === 'vendor'
  const pro = type !== 'worker'
  return (
    <form action={action} onReset={keepInputs} className="space-y-5">
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
          <div>
            <label className="label">주민등록번호</label>
            <div className="flex items-center gap-2">
              <input name="rrn1" className="input min-w-0 text-center" inputMode="numeric" maxLength={6} placeholder="앞 6자리" onInput={digitsThenNext} data-next="rrn2" required />
              <span className="text-mute">-</span>
              <input
                name="rrn2"
                type="password"
                className="input min-w-0 text-center tracking-widest"
                inputMode="numeric"
                maxLength={7}
                placeholder="뒤 7자리"
                autoComplete="off"
                onInput={digitsThenNext}
                data-next="phone"
                required
              />
            </div>
            <p className="hint">{pro ? '용역 대금의 사업소득(3.3%) 신고에 필요해요.' : '임금 지급 시 세금·보험 신고에 필요해요.'} 암호화해서 보관합니다.</p>
          </div>
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
        <div className="grid grid-cols-[1fr_1.2fr] gap-3">
          <select name="bank_name" className="input" defaultValue="">
            <option value="">은행 선택</option>
            {BANKS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <input name="bank_account" className="input" inputMode="numeric" placeholder="계좌번호" />
        </div>
        <input name="account_holder" className="input" placeholder={vendor ? '예금주 (비우면 상호)' : '예금주 (비우면 본인 이름)'} />
        {!vendor && <input name="address" className="input" placeholder="주소 (선택)" autoComplete="street-address" />}
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
        <h2 className="font-bold">동의</h2>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="agree_privacy" className="mt-0.5 size-5 accent-brand-600" required />
          <span>
            <b>[필수]</b> 개인정보 수집·이용에 동의합니다.
          </span>
        </label>
        <details className="rounded-xl bg-bg px-3.5 py-2.5 text-[13px] text-sub">
          <summary className="cursor-pointer font-semibold">내용 보기</summary>
          <dl className="mt-2 space-y-1.5">
            {PRIVACY_ITEMS.map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-ink">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
        {!vendor && (
          <label className="flex items-start gap-2.5">
            <input type="checkbox" name="agree_rrn" className="mt-0.5 size-5 accent-brand-600" required />
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
