'use client'

import { useActionState, useState } from 'react'
import { saveProInfo } from '@/app/actions/worker'
import { SPECIALTIES } from '@/lib/members'
import BizNoField from './BizNoField'
import { FormMessage, keepInputs, SubmitButton } from './ui'

/** 전문가·외주 업체 정보 고치기 (분야·소개·포트폴리오, 업체는 상호·사업자번호) */
export function ProInfoForm({
  vendor,
  initial,
}: {
  vendor: boolean
  initial: { specialty: string; intro: string; portfolio_url: string; biz_name: string; biz_no: string }
}) {
  const [state, action] = useActionState(saveProInfo, null)
  const [picked, setPicked] = useState<string[]>(initial.specialty ? initial.specialty.split(',') : [])
  return (
    <form action={action} onReset={keepInputs} className="card space-y-3">
      <h2 className="font-bold">{vendor ? '업체 정보' : '전문가 정보'}</h2>
      {vendor && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">상호</span>
            <input name="biz_name" className="input" defaultValue={initial.biz_name} required />
          </label>
          <div>
            <label className="label" htmlFor="biz_no">
              사업자등록번호
            </label>
            <BizNoField id="biz_no" name="biz_no" defaultValue={initial.biz_no} required />
          </div>
        </div>
      )}
      <div>
        <span className="label">전문 분야</span>
        <div className="flex flex-wrap gap-1.5">
          {SPECIALTIES.map((sp) => {
            const on = picked.includes(sp)
            return (
              <button key={sp} type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== sp) : [...p, sp]))} className={on ? 'chip-primary' : 'chip'}>
                {sp}
              </button>
            )
          })}
        </div>
        <input type="hidden" name="specialty" value={picked.join(',')} />
      </div>
      <label className="block">
        <span className="label">한 줄 소개</span>
        <input name="intro" className="input" maxLength={100} defaultValue={initial.intro} placeholder={vendor ? '행사 음향·조명 장비 임대·설치 10년' : '공연·행사 음향 엔지니어 7년'} />
      </label>
      <label className="block">
        <span className="label">포트폴리오·홈페이지</span>
        <input name="portfolio_url" className="input" inputMode="url" defaultValue={initial.portfolio_url} placeholder="https://" />
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary btn-sm">저장</SubmitButton>
    </form>
  )
}
