import Link from 'next/link'
import { setAllPaid, setPaid } from '@/app/actions/admin'
import { GroupContact } from '@/components/GroupContact'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { decrypt } from '@/lib/crypto'
import { maskAccount, won } from '@/lib/format'
import { calcDay, settle, TAX_LABEL } from '@/lib/pay'
import { minutesText } from '@/lib/time'
import type { Attendance, Job } from '@/lib/types'
import type { WorkerLite } from './page'

export default function PayTab({ job, atts, users, origin }: { job: Job; atts: Attendance[]; users: Map<string, WorkerLite>; origin: string }) {
  const userIds = [...new Set(atts.map((a) => a.user_id))]
  const rows = userIds
    .map((uid) => {
      const mine = atts.filter((a) => a.user_id === uid)
      const done = mine.filter((a) => a.clock_out)
      return {
        uid,
        user: users.get(uid),
        s: settle(job, mine.map((a) => calcDay(job, a))),
        paid: done.length > 0 && done.every((a) => a.paid),
        done: done.length,
        unconfirmed: done.filter((a) => !a.confirmed).length,
      }
    })
    .sort((a, b) => (a.user?.name ?? '').localeCompare(b.user?.name ?? '', 'ko'))
  const sum = (k: 'gross' | 'incomeTax' | 'localTax' | 'insurance' | 'deduction' | 'net' | 'paidMin' | 'days') =>
    rows.reduce((t, r) => t + r.s[k], 0)
  const incomplete = rows.reduce((t, r) => t + r.s.incomplete, 0)
  const unconfirmed = rows.reduce((t, r) => t + r.unconfirmed, 0)
  // 계좌가 없으면 입금을 못 하므로 정산 전에 한 번에 요청
  const noAccount = rows.filter((r) => !r.user?.bank_account_enc)
  const unpaid = rows.filter((r) => r.done > 0 && !r.paid)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sub">
          {job.pay_type === 'daily' ? `일급 ${won(job.daily_wage)}` : `시급 ${won(job.hourly_wage)}`} · {TAX_LABEL[job.tax_type]}
          {job.tax_type === 'daily' && job.employment_insurance ? ' · 고용보험 0.9%' : ''}
          {job.premium_enabled ? ' · 연장·야간 가산' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {unpaid.length > 0 && (
            <form action={setAllPaid.bind(null, job.id)}>
              <ConfirmSubmit className="btn-soft btn-sm" confirmText={`${unpaid.length}명 모두 지급 완료로 바꿀까요?`}>
                미지급 {unpaid.length}명 모두 지급 완료
              </ConfirmSubmit>
            </form>
          )}
          <Link href={`/admin/jobs/${job.id}/edit`} className="btn-gray btn-sm">
            급여 설정 바꾸기
          </Link>
          <a href={`/admin/export/settlement?job=${job.id}`} className="btn-primary btn-sm">
            정산표 엑셀(CSV)
          </a>
        </div>
      </div>
      {noAccount.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p className="min-w-0 flex-1">
            계좌 미등록 <b>{noAccount.length}명</b>: {noAccount.map((r) => r.user?.name ?? '알 수 없음').join(', ')}
          </p>
          <GroupContact
            copy={false}
            className="chip-primary"
            phones={noAccount.map((r) => r.user?.phone)}
            label={`${noAccount.length}명에게 계좌 등록 요청`}
            body={`[${job.title}] 급여를 보내 드리려면 계좌가 필요해요. 앱의 내 정보에서 급여 계좌를 등록해 주세요.\n${origin}/me/profile`}
          />
        </div>
      )}
      {(incomplete > 0 || unconfirmed > 0) && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {incomplete > 0 && `퇴근 기록이 없는 근무 ${incomplete}건은 금액에서 빠져 있습니다. `}
          {unconfirmed > 0 && `아직 확정하지 않은 근무 ${unconfirmed}건이 있습니다. 출퇴근 탭에서 확인해 주세요.`}
        </p>
      )}
      {rows.length === 0 ? (
        <div className="card py-10 text-center text-mute">아직 근무 기록이 없습니다.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table text-[13px]">
            <thead>
              <tr>
                <th>이름</th>
                <th>일수</th>
                <th>인정시간</th>
                <th className="text-right">지급총액</th>
                <th className="text-right">소득세</th>
                <th className="text-right">지방세</th>
                <th className="text-right">고용보험</th>
                <th className="text-right">기타공제</th>
                <th className="text-right">실지급액</th>
                <th>계좌</th>
                <th>지급</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid}>
                  <td className="font-semibold whitespace-nowrap">
                    <Link href={`/admin/workers/${r.uid}`}>{r.user?.name}</Link>
                  </td>
                  <td>{r.s.days}</td>
                  <td className="whitespace-nowrap">{minutesText(r.s.paidMin)}</td>
                  <td className="text-right">{won(r.s.gross)}</td>
                  <td className="text-right">{won(r.s.incomeTax)}</td>
                  <td className="text-right">{won(r.s.localTax)}</td>
                  <td className="text-right">{won(r.s.insurance)}</td>
                  <td className="text-right">{won(r.s.deduction)}</td>
                  <td className="text-right font-bold">{won(r.s.net)}</td>
                  <td className="text-xs whitespace-nowrap text-sub">
                    {r.user?.bank_account_enc ? (
                      `${r.user.bank_name ?? ''} ${maskAccount(decrypt(r.user.bank_account_enc))}`
                    ) : (
                      <span className="text-rose-500">미등록</span>
                    )}
                  </td>
                  <td>
                    <form action={setPaid.bind(null, job.id, r.uid, !r.paid)}>
                      <SubmitButton className={r.paid ? 'badge bg-emerald-50 text-emerald-700' : 'badge bg-gray-100 text-sub'} pendingText="…">
                        {r.paid ? '지급완료' : '미지급'}
                      </SubmitButton>
                    </form>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/print/payslip/${job.id}/${r.uid}`} className="text-xs font-semibold text-brand-600">
                      명세서
                    </Link>
                    <Link href={`/print/cert/${job.id}/${r.uid}`} className="ml-2 text-xs font-semibold text-sub">
                      확인서
                    </Link>
                  </td>
                </tr>
              ))}
              <tr className="bg-bg font-bold">
                <td>합계 {rows.length}명</td>
                <td>{sum('days')}</td>
                <td className="whitespace-nowrap">{minutesText(sum('paidMin'))}</td>
                <td className="text-right">{won(sum('gross'))}</td>
                <td className="text-right">{won(sum('incomeTax'))}</td>
                <td className="text-right">{won(sum('localTax'))}</td>
                <td className="text-right">{won(sum('insurance'))}</td>
                <td className="text-right">{won(sum('deduction'))}</td>
                <td className="text-right">{won(sum('net'))}</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-mute">
        소득세는 근무자별로 이 공고의 근무일을 한 번에 지급한다고 보고 계산합니다 (1천원 미만 소액부징수). 원천징수한 세금은 다음 달 10일까지 신고·납부하고,
        월별 신고자료는 정산·신고자료 메뉴에서 내려받으세요.
      </p>
    </div>
  )
}
