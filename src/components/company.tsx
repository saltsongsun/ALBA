'use client'

import { usePathname } from 'next/navigation'
import { useActionState, useRef } from 'react'
import { addCompanyAdmin, createCompany, switchCompany } from '@/app/actions/company'
import BizNoField from './BizNoField'
import { FormMessage, SubmitButton } from './ui'

/** 관리자 화면 위 회사 고르기 (고르면 바로 그 회사 화면으로 — 보던 메뉴 그대로) */
export function CompanySwitcher({
  companies,
  current,
  unread = {},
  waiting = {},
  lapsed = {},
  events = {},
}: {
  companies: { id: string; name: string }[]
  current: string
  unread?: Record<string, number>
  /** 다른 회사에서 확정을 기다리는 지원자 수 */
  waiting?: Record<string, number>
  /** 다른 회사의 끝난 행사에서 결과를 못 들은 대기 지원자 수 (대시보드 '결과 안 알림'과 같음 · 점은 안 켬 — 새로 온 일이 아니라서) */
  lapsed?: Record<string, number>
  /** 다른 회사의 행사: '오늘 행사 2' · '내일 행사 1' 같은 짧은 말 (알림 점은 안 켬 — 새로 온 일이 아니라서) */
  events?: Record<string, string>
}) {
  const path = usePathname()
  // 쓴 내용이 있을 때 한 번 멈춘 뒤 다시 고를 수 있는 때까지
  const armedUntil = useRef(0)
  // 다른 회사에 새 문의·확정 대기 지원자가 있으면 점 + 고르기 목록에 '· 새 문의 N · 대기 N'
  const other = Object.values(unread).reduce((n, x) => n + x, 0) + Object.values(waiting).reduce((n, x) => n + x, 0)
  return (
    <form action={switchCompany} className="min-w-0">
      {/* 보고 있던 메뉴에 그대로 남도록 (서버에서 정해 둔 메뉴만 받음) */}
      <input type="hidden" name="back" value={path} />
      <label className="flex min-w-0 items-center gap-1.5 text-sm">
        <span aria-hidden className="relative">
          🏢
          {other > 0 && <span data-other-unread className="absolute -top-0.5 -right-1 size-2 animate-pop rounded-full bg-rose-500 ring-2 ring-white" />}
        </span>
        <span className="sr-only">회사</span>
        {/* key: 다른 곳(대시보드 안내 등)에서 회사를 바꿔도 고르기 칸이 지금 회사로 맞춰지게 */}
        <select
          key={current}
          name="company"
          defaultValue={current}
          aria-label="회사 고르기"
          className="min-w-0 truncate rounded-lg border border-line bg-white py-1 pr-7 pl-2 font-semibold"
          onChange={(e) => {
            const el = e.currentTarget
            // 이 화면에 저장하지 않은 내용이 있으면(UnsavedBar) 한 번 멈추고 알림 → 4초 안에 다시 고르면 바꿈
            if (document.documentElement.dataset.unsavedForm === '1' && Date.now() > armedUntil.current) {
              el.value = current
              armedUntil.current = Date.now() + 4000
              window.dispatchEvent(new Event('unsaved:switch'))
              return
            }
            el.form?.requestSubmit()
          }}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.id !== current && unread[c.id] ? ` · 새 문의 ${unread[c.id]}` : ''}
              {c.id !== current && waiting[c.id] ? ` · 대기 ${waiting[c.id]}` : ''}
              {c.id !== current && lapsed[c.id] ? ` · 결과 안 알림 ${lapsed[c.id]}` : ''}
              {c.id !== current && events[c.id] ? ` · ${events[c.id]}` : ''}
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
        <div>
          <label className="label" htmlFor="new_business_no">
            사업자등록번호 (선택)
          </label>
          <BizNoField id="new_business_no" placeholder="000-00-00000" />
        </div>
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
