'use client'

import { useActionState } from 'react'
import { saveCareers } from '@/app/actions/worker'
import type { Career } from '@/lib/careers'
import CareerEditor from './CareerEditor'
import Fold from './Fold'
import { FormMessage, SubmitButton } from './ui'

/** 내 정보: 행사 경력 고치기 */
export default function CareerForm({ initial }: { initial: Career[] }) {
  const [state, action] = useActionState(saveCareers, null)
  return (
    <Fold title="행사 경력" summary={initial.length ? `${initial.length}개 · ${initial[0].event || initial[0].role}` : '아직 없음 · 적으면 확정에 도움이 돼요'}>
      <form action={action} className="space-y-3">
        <CareerEditor initial={initial} />
        <FormMessage state={state} />
        <SubmitButton className="btn-soft">경력 저장</SubmitButton>
      </form>
    </Fold>
  )
}
