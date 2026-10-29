import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/ui'
import { maskAccount, won, wonKorean } from '@/lib/format'
import { loadWorkerPay } from '@/lib/payroll'
import { requireUser } from '@/lib/session'
import { fmtDate, fmtDateLong, kstDate, kstTime, minutesText } from '@/lib/time'

export const metadata: Metadata = { title: '임금명세서' }

const h = (min: number) => (min / 60).toFixed(min % 60 ? 2 : 0).replace(/\.?0+$/, '')

export default async function PayslipPage(props: PageProps<'/print/payslip/[jobId]/[userId]'>) {
  const { jobId, userId } = await props.params
  const viewer = await requireUser(`/print/payslip/${jobId}/${userId}`)
  const data = await loadWorkerPay(viewer, jobId, userId)
  if (!data) notFound()
  const { job, settings, worker, rows, total } = data
  const hourly = job.pay_type === 'hourly'
  const paidDates = rows.filter((r) => r.paid_at).map((r) => r.paid_at!)
  const payDate = paidDates.length ? kstDate(paidDates.sort().at(-1)!) : null

  const earnings: [string, number, string][] = [
    [
      '기본급',
      total.basePay,
      hourly ? `${h(total.paidMin)}시간 × ${won(job.hourly_wage)}` : `${total.days}일 × ${won(job.daily_wage)}`,
    ],
  ]
  if (total.overtimePay) earnings.push(['연장근로수당', total.overtimePay, `${h(total.overtimeMin)}시간 × ${won(job.hourly_wage)} × 0.5`])
  if (total.nightPay) earnings.push(['야간근로수당', total.nightPay, `${h(total.nightMin)}시간 × ${won(job.hourly_wage)} × 0.5`])
  if (total.allowance) earnings.push([job.allowance_label || '수당', total.allowance, `${total.days}일 × ${won(job.allowance)}`])
  if (total.extraPay) earnings.push(['기타 지급', total.extraPay, '관리자 추가 지급'])

  const deductions: [string, number, string][] = []
  if (job.tax_type === 'daily') {
    deductions.push(['소득세', total.incomeTax, '(일급 − 15만원) × 2.7%, 1천원 미만 소액부징수'])
    deductions.push(['지방소득세', total.localTax, '소득세 × 10%'])
    if (job.employment_insurance) deductions.push(['고용보험', total.insurance, '지급총액 × 0.9%'])
  } else if (job.tax_type === 'business') {
    deductions.push(['사업소득세', total.incomeTax, '지급총액 × 3%'])
    deductions.push(['지방소득세', total.localTax, '소득세 × 10%'])
  }
  if (total.deduction) deductions.push(['기타 공제', total.deduction, '관리자 공제'])

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={viewer.id === userId ? '/me' : `/admin/jobs/${jobId}?tab=pay`} className="text-sm font-semibold text-sub">
          ← 돌아가기
        </Link>
        <PrintButton />
      </div>
      <article className="print-sheet card px-5 py-7 sm:px-9">
        <h1 className="mb-6 text-center text-2xl font-extrabold tracking-[0.3em]">임금명세서</h1>
        <table className="table mb-5 border-t border-line">
          <tbody>
            <tr>
              <th className="w-24">성명</th>
              <td>{worker.name}</td>
              <th className="w-24">생년월일</th>
              <td>{worker.birth_date ? fmtDateLong(worker.birth_date) : '-'}</td>
            </tr>
            <tr>
              <th>근무</th>
              <td colSpan={3}>
                {job.title}
                {job.event_name ? ` (${job.event_name})` : ''}
              </td>
            </tr>
            <tr>
              <th>지급일</th>
              <td>{payDate ? fmtDateLong(payDate) : job.pay_day || '지급 예정'}</td>
              <th>지급계좌</th>
              <td>{worker.bank_account ? `${worker.bank_name ?? ''} ${maskAccount(worker.bank_account)}` : '-'}</td>
            </tr>
          </tbody>
        </table>

        <div className="grid gap-5 sm:grid-cols-2">
          <section>
            <h2 className="mb-1.5 font-bold">지급 내역</h2>
            <table className="table border-t border-line">
              <tbody>
                {earnings.map(([k, v, how]) => (
                  <tr key={k}>
                    <th className="w-28">{k}</th>
                    <td className="text-right font-semibold">{won(v)}</td>
                  </tr>
                ))}
                <tr>
                  <th>지급총액</th>
                  <td className="text-right font-extrabold">{won(total.gross)}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section>
            <h2 className="mb-1.5 font-bold">공제 내역</h2>
            <table className="table border-t border-line">
              <tbody>
                {deductions.length === 0 && (
                  <tr>
                    <td className="text-mute">공제 없음</td>
                  </tr>
                )}
                {deductions.map(([k, v]) => (
                  <tr key={k}>
                    <th className="w-28">{k}</th>
                    <td className="text-right font-semibold">{won(v)}</td>
                  </tr>
                ))}
                <tr>
                  <th>공제총액</th>
                  <td className="text-right font-extrabold">{won(total.totalDeduction)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <div className="my-6 rounded-2xl bg-brand-50 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-brand-700">실수령액</p>
          <p className="text-3xl font-extrabold text-brand-700">{won(total.net)}</p>
          <p className="text-xs text-sub">일금 {wonKorean(total.net)}원정</p>
        </div>

        <h2 className="mb-1.5 font-bold">계산 방법</h2>
        <table className="table mb-6 border-t border-line text-[13px]">
          <tbody>
            {[...earnings, ...deductions].map(([k, , how]) => (
              <tr key={k}>
                <th className="w-28">{k}</th>
                <td>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mb-1.5 font-bold">근무 내역</h2>
        <div className="overflow-x-auto">
          <table className="table border-t border-line text-[13px]">
            <thead>
              <tr>
                <th>날짜</th>
                <th>출근</th>
                <th>퇴근</th>
                <th>휴게</th>
                <th>인정</th>
                <th>연장/야간</th>
                <th className="text-right">지급액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.work_date)}</td>
                  <td>{kstTime(r.adj_in ?? r.clock_in)}</td>
                  <td>{r.adj_out ?? r.clock_out ? kstTime((r.adj_out ?? r.clock_out)!) : '미기록'}</td>
                  <td>{r.pay.breakMin}분</td>
                  <td>{minutesText(r.pay.paidMin)}</td>
                  <td>
                    {r.pay.overtimeMin ? `${h(r.pay.overtimeMin)}h` : '-'} / {r.pay.nightMin ? `${h(r.pay.nightMin)}h` : '-'}
                  </td>
                  <td className="text-right">{won(r.pay.gross)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="font-bold">
                  합계 {total.days}일
                </td>
                <td className="font-bold">{minutesText(total.paidMin)}</td>
                <td />
                <td className="text-right font-bold">{won(total.gross)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {total.incomplete > 0 && (
          <p className="mt-2 text-xs text-amber-600">퇴근 기록이 없는 {total.incomplete}일은 담당자 확인 후 반영됩니다.</p>
        )}

        <div className="relative mt-8 text-right text-sm">
          <p className="font-bold">{settings.company_name}</p>
          <p>
            대표 {settings.ceo_name ?? ''} <span className="text-mute">(인)</span>
          </p>
          {settings.seal_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.seal_image} alt="직인" className="absolute -top-3 right-0 size-16 object-contain mix-blend-multiply" />
          )}
          <p className="mt-2 text-[11px] text-mute">근로기준법 제48조 제2항에 따른 임금명세서 · 발행 {fmtDateLong(kstDate())}</p>
        </div>
      </article>
    </div>
  )
}
