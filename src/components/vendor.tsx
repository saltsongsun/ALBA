'use client'

import { useActionState, useState } from 'react'
import { createQuoteRequest, recordQuote, savePayment, saveVendor, submitQuote } from '@/app/actions/vendor'
import { wonReadable } from '@/lib/format'
import { BANKS } from '@/lib/privacy'
import { VENDOR_CATEGORIES } from '@/lib/vendors'
import { onAccountPaste } from './accountPaste'
import { onPhoneInput, phoneShown } from './phoneTyping'
import BizNoField from './BizNoField'
import { FormMessage, keepInputs, SubmitButton } from './ui'
import Link from 'next/link'

type Opt = { id: string; label: string }

/** 금액 입력: 숫자만 받아 읽기 쉽게 (쉼표 붙인 금액을 아래에 보여 줌) */
function AmountInput({ defaultValue, label = '금액 (원)', autoFocus = false }: { defaultValue?: number | null; label?: string; autoFocus?: boolean }) {
  const [v, setV] = useState(defaultValue != null ? String(defaultValue) : '')
  const n = Number(v.replace(/[^\d]/g, ''))
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        name="amount"
        inputMode="numeric"
        autoComplete="off"
        className="input text-lg font-bold tabular-nums"
        placeholder="예: 1500000"
        value={v}
        autoFocus={autoFocus}
        onChange={(e) => setV(e.target.value.replace(/[^\d,]/g, ''))}
        required
      />
      {/* 쓰는 대로 '1,500,000원 · 150만 원' — 큰 금액의 0 자리 실수를 바로 알 수 있게 */}
      {n > 0 && (
        <span className="mt-1 block text-sm font-semibold text-brand-700 tabular-nums" data-amount-read>
          {n.toLocaleString('ko-KR')}원{n >= 10000 && <span className="font-medium text-sub"> · {wonReadable(n)}</span>}
        </span>
      )}
    </label>
  )
}

function VatChoice({ included = true }: { included?: boolean }) {
  return (
    <div className="flex gap-2 text-sm">
      {(
        [
          ['included', '부가세 포함'],
          ['excluded', '부가세 별도'],
        ] as const
      ).map(([v, label]) => (
        <label key={v} className="flex-1 cursor-pointer">
          <input type="radio" name="vat" value={v} defaultChecked={(v === 'included') === included} className="peer sr-only" />
          <span className="block rounded-xl bg-white px-3 py-2.5 text-center font-semibold text-sub ring-1 ring-line peer-checked:bg-brand-600 peer-checked:text-white peer-checked:ring-brand-600">
            {label}
          </span>
        </label>
      ))}
    </div>
  )
}

/** 외주사 등록·수정 */
/** 이미 등록된 업체 (같은 연락처·사업자등록번호를 쓰는 대로 알려 주려고) */
type ExistingVendor = { id: string; name: string; phone: string | null; business_no: string | null }

export function VendorForm({
  id = null,
  initial,
  existing = [],
}: {
  id?: string | null
  existing?: ExistingVendor[]
  initial?: {
    name: string
    category: string | null
    contact_name: string | null
    phone: string | null
    email: string | null
    business_no: string | null
    bank_name: string | null
    account_masked: string | null
    account_holder: string | null
    memo: string | null
    active: boolean
  }
}) {
  const [state, action] = useActionState(saveVendor.bind(null, id), null)
  // 같은 업체를 두 번 등록하지 않게: 연락처·사업자등록번호를 쓰는 대로 이미 있는 업체를 알려 줌 (저장할 때 서버도 막음)
  const [dup, setDup] = useState<{ v: ExistingVendor; why: string } | null>(null)
  const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
  const check = (form: HTMLFormElement) => {
    const phone = digits((form.elements.namedItem('phone') as HTMLInputElement | null)?.value)
    const biz = digits((form.elements.namedItem('business_no') as HTMLInputElement | null)?.value)
    const others = existing.filter((v) => v.id !== id)
    const byPhone = phone.length >= 9 ? others.find((v) => digits(v.phone) === phone) : undefined
    const byBiz = biz.length === 10 ? others.find((v) => digits(v.business_no) === biz) : undefined
    setDup(byPhone ? { v: byPhone, why: '연락처' } : byBiz ? { v: byBiz, why: '사업자등록번호' } : null)
  }
  return (
    <form
      action={action}
      onReset={keepInputs}
      onInput={(e) => {
        const n = (e.target as HTMLInputElement).name
        if (n === 'phone' || n === 'business_no') check(e.currentTarget)
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">상호 *</span>
          <input name="name" className="input" required maxLength={60} defaultValue={initial?.name} placeholder="예: 한빛음향" />
        </label>
        <label>
          <span className="label">분야</span>
          <input name="category" className="input" list="vendor-categories" maxLength={30} defaultValue={initial?.category ?? ''} placeholder="고르거나 직접 입력" />
          <datalist id="vendor-categories">
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="label">담당자</span>
          <input name="contact_name" className="input" maxLength={30} defaultValue={initial?.contact_name ?? ''} />
        </label>
        <label>
          <span className="label">연락처</span>
          <input name="phone" className="input" inputMode="tel" maxLength={20} defaultValue={phoneShown(initial?.phone)} placeholder="010-0000-0000" onInput={onPhoneInput} />
        </label>
        <label>
          <span className="label">이메일</span>
          <input name="email" type="email" className="input" maxLength={100} defaultValue={initial?.email ?? ''} />
        </label>
        <div>
          <label className="label" htmlFor="vendor_business_no">
            사업자등록번호
          </label>
          <BizNoField id="vendor_business_no" defaultValue={initial?.business_no ?? ''} placeholder="000-00-00000" />
        </div>
      </div>
      {dup && (
        <Link href={`/admin/vendors/${dup.v.id}`} className="flex animate-pop items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900" data-vendor-dup>
          <span className="min-w-0 flex-1 truncate">
            이미 등록된 외주사예요 · <b>{dup.v.name}</b> (같은 {dup.why})
          </span>
          <span aria-hidden className="shrink-0">›</span>
        </Link>
      )}
      <fieldset className="space-y-2 rounded-xl bg-bg p-3">
        <legend className="label">대금 받을 계좌</legend>
        {initial?.account_masked && (
          <p className="text-sm text-sub">
            지금: {initial.bank_name} {initial.account_masked} · 바꿀 때만 새로 입력하세요.
          </p>
        )}
        <div className="grid grid-cols-[1fr_1.3fr] gap-2">
          <select name="bank_name" className="input" defaultValue={initial?.bank_name ?? ''}>
            <option value="">은행 선택</option>
            {BANKS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <input name="bank_account" className="input" inputMode="numeric" placeholder="계좌번호" autoComplete="off" onPaste={onAccountPaste} />
        </div>
        <input name="account_holder" className="input" maxLength={40} defaultValue={initial?.account_holder ?? ''} placeholder="예금주" />
        {initial?.account_masked && (
          <label className="flex items-center gap-2 text-sm text-sub">
            <input type="checkbox" name="clear_account" className="size-4 accent-brand-600" /> 등록된 계좌 지우기
          </label>
        )}
      </fieldset>
      <textarea name="memo" className="input min-h-20" maxLength={500} defaultValue={initial?.memo ?? ''} placeholder="메모 (주로 맡기는 일, 특이사항 등)" />
      {id && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="size-4 accent-brand-600" /> 거래 중 (끄면 견적 요청 목록에서 빠져요)
        </label>
      )}
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="저장 중…">
        {id ? '저장' : '외주사 등록'}
      </SubmitButton>
    </form>
  )
}

/** 견적 요청 만들기: 내용·마감일·공고 연결·받을 업체 */
export function QuoteRequestForm({ vendors, jobs, jobId = '' }: { vendors: (Opt & { category: string | null })[]; jobs: Opt[]; jobId?: string }) {
  const [state, action] = useActionState(createQuoteRequest, null)
  const [cat, setCat] = useState('')
  const cats = [...new Set(vendors.map((v) => v.category).filter((c): c is string => !!c))]
  return (
    <form action={action} onReset={keepInputs} className="space-y-3">
      <label className="block">
        <span className="label">요청 제목 *</span>
        <input name="title" className="input" required maxLength={80} placeholder="예: 무대 음향 장비 2일 (11/8~9)" />
      </label>
      <label className="block">
        <span className="label">요청 내용</span>
        <textarea name="details" className="input min-h-28" maxLength={2000} placeholder={'품목·수량·일정·장소·설치/철수 시간 등\n예) 메인 스피커 4조, 무선마이크 6개, 콘솔 1대 / 11/8 07:00 설치, 11/9 19:00 철수'} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">견적 마감일</span>
          <input type="date" name="due_date" className="input" />
        </label>
        <label>
          <span className="label">연결할 공고 (선택)</span>
          <select name="job_id" className="input" defaultValue={jobId}>
            <option value="">공고 없음</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="label">견적 받을 업체 * (여러 곳 고르면 나란히 비교)</legend>
        {vendors.length === 0 ? (
          <p className="text-sm text-mute">먼저 ‘업체’ 탭에서 외주사를 등록해 주세요.</p>
        ) : (
          <>
            {cats.length > 1 && (
              <div className="fade-x mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
                {['', ...cats].map((c) => (
                  <button
                    key={c || 'all'}
                    type="button"
                    onClick={() => setCat(c)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${cat === c ? 'bg-ink text-white ring-ink' : 'bg-white text-sub ring-line'}`}
                  >
                    {c || '전체'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {vendors.map((v) => (
                <label key={v.id} className={cat && v.category !== cat ? 'hidden' : ''}>
                  <input type="checkbox" name="vendor" value={v.id} className="peer sr-only" />
                  <span className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-sub ring-1 ring-line peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-checked:ring-brand-500">
                    {v.label}
                    {v.category && <span className="text-xs font-medium text-mute">{v.category}</span>}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="만드는 중…">
        견적 요청 만들기
      </SubmitButton>
      <p className="hint">만들면 업체마다 견적 입력 링크가 생겨요. 문자·카톡으로 보내면 업체가 로그인 없이 금액을 적어 보내요.</p>
    </form>
  )
}

/** 관리자가 전화·메일로 받은 견적 기록 */
export function RecordQuoteForm({ quoteId, amount, vat = true, note }: { quoteId: string; amount: number | null; vat?: boolean; note: string | null }) {
  const [state, action] = useActionState(recordQuote.bind(null, quoteId), null)
  return (
    <form action={action} onReset={keepInputs} className="space-y-2.5">
      <AmountInput defaultValue={amount} label="견적 금액 (원)" />
      <VatChoice included={vat} />
      <input name="note" className="input text-sm" maxLength={1000} defaultValue={note ?? ''} placeholder="메모 (예: 전화로 받음, 설치비 포함)" />
      <FormMessage state={state} />
      <SubmitButton className="btn-soft btn-sm w-full" pendingText="저장 중…">
        받은 견적 기록
      </SubmitButton>
    </form>
  )
}

/** 외주 대금 지급 건 등록·수정 */
export function PaymentForm({
  id = null,
  vendors,
  jobs,
  initial,
}: {
  id?: string | null
  vendors: Opt[]
  jobs: Opt[]
  initial?: { vendor_id: string; job_id: string | null; title: string; amount: number; vat_included: boolean; due_date: string | null; memo: string | null }
}) {
  const [state, action] = useActionState(savePayment.bind(null, id), null)
  return (
    <form action={action} onReset={keepInputs} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">외주사 *</span>
          <select name="vendor_id" className="input" required defaultValue={initial?.vendor_id ?? ''}>
            <option value="" disabled>
              고르기
            </option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">공고 (행사별 비용 합계에 들어감)</span>
          <select name="job_id" className="input" defaultValue={initial?.job_id ?? ''}>
            <option value="">공고 없음</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">내용 *</span>
        <input name="title" className="input" required maxLength={80} defaultValue={initial?.title} placeholder="예: 무대 음향 장비 임차" />
      </label>
      <AmountInput defaultValue={initial?.amount} />
      <VatChoice included={initial?.vat_included ?? true} />
      <label className="block">
        <span className="label">지급 예정일</span>
        <input type="date" name="due_date" className="input" defaultValue={initial?.due_date ?? ''} />
      </label>
      <input name="memo" className="input text-sm" maxLength={500} defaultValue={initial?.memo ?? ''} placeholder="메모 (선택)" />
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="저장 중…">
        {id ? '저장' : '지급 건 등록'}
      </SubmitButton>
    </form>
  )
}

/** 업체가 링크에서 견적을 냄 (로그인 없음) */
export function QuoteSubmitForm({ token, amount, vat = true, note }: { token: string; amount: number | null; vat?: boolean; note: string | null }) {
  const [state, action] = useActionState(submitQuote.bind(null, token), null)
  return (
    <form action={action} onReset={keepInputs} className="space-y-3">
      {/* 봇 함정 (사람은 보이지 않음) */}
      <div aria-hidden className="sr-only">
        <label>
          웹사이트
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <AmountInput defaultValue={amount} label="견적 금액 (원) *" />
      <VatChoice included={vat} />
      <label className="block">
        <span className="label">내용·조건 (선택)</span>
        <textarea name="note" className="input min-h-24" maxLength={1000} defaultValue={note ?? ''} placeholder="포함 품목, 설치·철수, 결제 조건, 견적서 파일 링크 등" />
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3.5 text-base" pendingText="보내는 중…">
        {amount != null ? '견적 다시 보내기' : '견적 보내기'}
      </SubmitButton>
    </form>
  )
}
