'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { login, setupAdmin, signup } from '@/app/actions/auth'
import { BANKS, PRIVACY_ITEMS, RRN_NOTICE } from '@/lib/privacy'
import { FormMessage, keepInputs, SubmitButton } from './ui'

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

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(login, null)
  return (
    <form action={action} onReset={keepInputs} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="phone">
          휴대폰 번호
        </label>
        <input id="phone" name="phone" className="input" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" maxLength={13} onInput={formatPhone} required />
      </div>
      <div>
        <label className="label" htmlFor="pin">
          비밀번호 (숫자 6자리)
        </label>
        <input
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

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState(signup, null)
  return (
    <form action={action} onReset={keepInputs} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <section className="card space-y-4">
        <h2 className="font-bold">기본 정보 <span className="text-sm font-medium text-rose-500">필수</span></h2>
        <div>
          <label className="label" htmlFor="name">
            이름
          </label>
          <input id="name" name="name" className="input" autoComplete="name" placeholder="홍길동" required />
        </div>
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
          <p className="hint">임금 지급 시 세금·보험 신고에 필요해요. 암호화해서 보관합니다.</p>
        </div>
        <div>
          <label className="label" htmlFor="phone">
            휴대폰 번호
          </label>
          <input id="phone" name="phone" className="input" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678" maxLength={13} onInput={formatPhone} required />
          <p className="hint">로그인 아이디로 쓰여요.</p>
        </div>
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
            <input
              id="pin2"
              name="pin2"
              type="password"
              className="input tracking-[0.3em]"
              inputMode="numeric"
              maxLength={6}
              autoComplete="new-password"
              onInput={digitsOnly}
              required
            />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">
          급여 받을 계좌 <span className="text-sm font-medium text-mute">선택 · 나중에 입력해도 돼요</span>
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
        <input name="account_holder" className="input" placeholder="예금주 (비우면 본인 이름)" />
        <input name="address" className="input" placeholder="주소 (선택)" autoComplete="street-address" />
      </section>

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
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="agree_rrn" className="mt-0.5 size-5 accent-brand-600" required />
          <span>
            <b>[필수]</b> 고유식별정보(주민등록번호) 처리 안내를 확인했습니다.
            <span className="mt-1 block text-[13px] text-mute">{RRN_NOTICE}</span>
          </span>
        </label>
      </section>

      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3.5 text-base" pendingText="가입 중…">
        가입하기
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
