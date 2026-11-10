import Link from 'next/link'
import { switchCompany } from '@/app/actions/company'
import Icon from './Icon'
import { SubmitButton } from './ui'

/**
 * 지금 보는 회사가 아닌, 내가 맡은 다른 회사의 공고·단체방 주소를 열었을 때 (알림·공유 링크).
 * '찾는 화면이 없어요' 대신: 어느 회사 것인지 알려 주고, 그 회사로 바꿔서 보려던 화면을 바로 엶
 */
export default function OtherCompanyJob({ title, company, now, open }: { title: string; company: { id: string; name: string }; now: string; open: string }) {
  return (
    <div className="mx-auto max-w-md py-6" data-other-company-job>
      <div className="card animate-pop space-y-4 text-center">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-xl text-brand-600">
          <Icon name="building" />
        </span>
        <div>
          <h1 className="text-lg font-extrabold">{title}</h1>
          <p className="mt-1 truncate text-sm text-sub" data-other-company-now>
            지금은 <b className="font-semibold text-ink">{now}</b> 화면이에요
          </p>
        </div>
        <form action={switchCompany}>
          <input type="hidden" name="company" value={company.id} />
          <input type="hidden" name="open" value={open} />
          <SubmitButton className="btn-primary w-full" pendingText="바꾸는 중…" track="다른 회사 공고 열기">
            <span className="min-w-0 truncate">{company.name}</span>
            <span className="shrink-0 whitespace-nowrap">화면에서 열기</span>
          </SubmitButton>
        </form>
        <Link href="/admin/jobs" className="inline-block text-sm font-semibold text-sub">
          지금 회사 공고 목록으로
        </Link>
      </div>
    </div>
  )
}
