'use client'

import { useActionState } from 'react'
import { addCompanyAdmin, createCompany, switchCompany } from '@/app/actions/company'
import { FormMessage, SubmitButton } from './ui'

/** 관리자 화면 위 회사 고르기 (고르면 바로 그 회사 화면으로) */
export function CompanySwitcher({ companies, current }: { companies: { id: string; name: string }[]; current: string }) {
  return (
    <form action={switchCompany} className="min-w-0">
      <label className="flex min-w-0 items-center gap-1.5 text-sm">
        <span aria-hidden>🏢</span>
        <span className="sr-only">회사</span>
        <select
          name="company"
          defaultValue={current}
          aria-label="회사 고르기"
          className="min-w-0 truncate rounded-lg border border-line bg-white py-1 pr-7 pl-2 font-semibold"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button className="btn-gray btn-sm">바꾸기</button>
      </noscript>
    </form>
  )
}

/** 회사 만들기 (최고 관리자) */
export function CreateCompanyForm() {
  const [state, action] = useActionState(createCompany, null)
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">회사 이름 (상호)</span>
          <input name="company_name" className="input" required placeholder="주식회사 ○○" />
        </label>
        <label>
          <span className="label">대표자 (선택)</span>
          <input name="ceo_name" className="input" />
        </label>
        <label>
          <span className="label">사업자등록번호 (선택)</span>
          <input name="business_no" className="input" inputMode="numeric" />
        </label>
        <label>
          <span className="label">문의 연락처 (선택)</span>
          <input name="contact_phone" className="input" inputMode="tel" />
        </label>
      </div>
      <p className="hint">직인·주소·기본 시급 등은 그 회사로 들어가 ‘회사 설정’에서 채워요. 기본 서류 서식(근로계약서 등)은 자동으로 넣어 드려요.</p>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary">회사 만들기</SubmitButton>
    </form>
  )
}

/** 회사에 관리자 초대 (휴대폰 번호, 처음이면 이름도) */
export function AddAdminForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(addCompanyAdmin.bind(null, companyId), null)
  return (
    <form action={action} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input name="phone" className="input py-2 text-sm" inputMode="tel" placeholder="휴대폰 번호" aria-label="관리자 휴대폰 번호" required />
        <input name="name" className="input py-2 text-sm" placeholder="이름 (처음 쓰는 번호만)" aria-label="관리자 이름" />
        <select name="role" className="input py-2 text-sm" aria-label="권한" defaultValue="admin">
          <option value="admin">관리자</option>
          <option value="owner">대표 관리자</option>
        </select>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-soft btn-sm">관리자 초대</SubmitButton>
    </form>
  )
}
