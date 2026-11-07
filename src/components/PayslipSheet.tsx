import { maskAccount, won, wonKorean } from '@/lib/format'
import type { WorkerPay } from '@/lib/payroll'
import { fmtDate, fmtDateLong, kstDate, kstTime, minutesText } from '@/lib/time'
import Watermark from './Watermark'
import SealMark from './SealMark'

const h = (min: number) => (min / 60).toFixed(min % 60 ? 2 : 0).replace(/\.?0+$/, '')

/** 임금명세서 한 장 (근무자 1명). 한 사람 화면·공고 전체 한 번에 인쇄에서 같이 씀 */
export default function PayslipSheet({ data, className = '', watermark }: { data: WorkerPay; className?: string; /** 열람 일시·열람자 */ watermark?: string }) {
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
  // 주휴수당: 같은 회사에서 한 주 15시간 이상 일하고 개근한 주마다 (그 주 마지막 근무일에 붙음)
  if (total.weeklyPay) {
    const weeks = rows.filter((r) => r.pay.weeklyPay > 0).map((r) => fmtDate(r.work_date))
    earnings.push(['주휴수당', total.weeklyPay, `${weeks.join('·')} 주 · 한 주 15시간 이상 개근 (소정시간 ÷ 40 × 8시간 × 시급)`])
  }

  const deductions: [string, number, string][] = []
  if (job.tax_type === 'daily') {
    deductions.push(['소득세', total.incomeTax, '(일급 − 15만원) × 2.7%, 1천원 미만 소액부징수'])
    deductions.push(['지방소득세', total.localTax, '소득세 × 10%'])
    if (job.employment_insurance) deductions.push(['고용보험', total.insurance, '지급총액 × 0.9%'])
  } else if (job.tax_type === 'business') {
    deductions.push(['사업소득세', total.incomeTax, '지급총액 × 3%'])
    deductions.push(['지방소득세', total.localTax, '소득세 × 10%'])
  } else if (job.tax_type === 'other') {
    deductions.push(['기타소득세', total.incomeTax, total.incomeTax ? '(지급액 − 필요경비 60%) × 20%' : '지급액 12만 5천원 이하 · 과세최저한'])
    deductions.push(['지방소득세', total.localTax, '소득세 × 10%'])
  }
  if (total.deduction) deductions.push(['기타 공제', total.deduction, '관리자 공제'])

  return (
      <article className={`print-sheet card relative px-5 py-7 sm:px-9 ${className}`}>
        {watermark && <Watermark text={watermark} />}
        {/* 전문가 의뢰(사업소득 3.3%)는 근로가 아니므로 '용역 대금 지급명세서' */}
        <h1 className={`mb-6 text-center text-2xl font-extrabold ${job.tax_type === 'business' || job.tax_type === 'other' ? 'tracking-[0.1em]' : 'tracking-[0.3em]'}`}>
          {job.tax_type === 'business' ? '용역 대금 지급명세서' : job.tax_type === 'other' ? '기타소득 지급명세서' : '임금명세서'}
        </h1>
        {/* 한 줄에 한 항목 (휴대폰에서 네 칸으로 나누면 날짜·계좌가 두세 줄로 쪼개짐) */}
        <table className="table mb-5 border-t border-line">
          <tbody>
            <tr>
              <th className="w-24">성명</th>
              <td>{worker.name}</td>
            </tr>
            <tr>
              <th>생년월일</th>
              <td>{worker.birth_date ? fmtDateLong(worker.birth_date) : '-'}</td>
            </tr>
            <tr>
              <th>근무</th>
              <td>
                {job.title}
                {job.event_name ? ` (${job.event_name})` : ''}
              </td>
            </tr>
            <tr>
              <th>지급일</th>
              <td>{payDate ? fmtDateLong(payDate) : job.pay_day || '지급 예정'}</td>
            </tr>
            <tr>
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

        <div className="mt-8 text-right text-sm">
          <p className="font-bold">{settings.company_name}</p>
          <p>
            대표 {settings.ceo_name ?? ''} <SealMark seal={settings.seal_image} />
          </p>
          <p className="mt-2 text-[11px] text-mute">{job.tax_type === 'business' ? '사업소득 원천징수(3.3%) 내역' : job.tax_type === 'other' ? '기타소득 원천징수(8.8%) 내역' : '근로기준법 제48조 제2항에 따른 임금명세서'} · <span className="whitespace-nowrap">발행 {fmtDateLong(kstDate())}</span></p>
        </div>
      </article>
  )
}
