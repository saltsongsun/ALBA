import type { Attendance, Job } from './types'
import { kstAt, nightMinutes } from './time'

export const MIN_WAGE_2026 = 10_320
const DAILY_INCOME_DEDUCTION = 150_000 // 일용근로소득 1일 근로소득공제
const DAILY_TAX_RATE = 0.06 * (1 - 0.55) // 세율 6%, 근로소득세액공제 55%
const BUSINESS_TAX_RATE = 0.03 // 사업소득 3% (+지방소득세 0.3%)
const EMPLOYMENT_INSURANCE_RATE = 0.009 // 고용보험 근로자 부담분
const MIN_WITHHOLDING = 1_000 // 소액부징수 기준

export type PayRule = Pick<
  Job,
  | 'pay_type'
  | 'hourly_wage'
  | 'daily_wage'
  | 'break_mode'
  | 'break_minutes'
  | 'round_unit'
  | 'early_clamp'
  | 'start_time'
  | 'premium_enabled'
  | 'allowance'
  | 'tax_type'
  | 'employment_insurance'
>

export type AttendanceTimes = Pick<
  Attendance,
  'clock_in' | 'clock_out' | 'adj_in' | 'adj_out' | 'break_override' | 'extra_pay' | 'deduction'
> & { work_date?: string }

export type DayPay = {
  incomplete: boolean
  spanMin: number
  breakMin: number
  paidMin: number
  overtimeMin: number
  nightMin: number
  basePay: number
  overtimePay: number
  nightPay: number
  allowance: number
  extraPay: number
  deduction: number
  gross: number
  dailyTax: number // 일용근로 일별 소득세 (소액부징수 판단 전)
}

export type Settlement = {
  days: number
  incomplete: number
  paidMin: number
  overtimeMin: number
  nightMin: number
  basePay: number
  overtimePay: number
  nightPay: number
  allowance: number
  extraPay: number
  gross: number
  incomeTax: number
  localTax: number
  insurance: number
  deduction: number
  totalDeduction: number
  net: number
}

const floor10 = (n: number) => Math.floor(n / 10) * 10

/**
 * 법정 최소 휴게시간(근로기준법 제54조)을 체류시간에서 역산.
 * 휴게를 뺀 근로시간이 4시간 이상이면 30분, 8시간 이상이면 1시간.
 */
export function legalBreak(spanMin: number): number {
  if (spanMin >= 540) return 60
  if (spanMin >= 270) return 30
  return 0
}

export function effectiveTimes(a: Pick<Attendance, 'clock_in' | 'clock_out' | 'adj_in' | 'adj_out'>) {
  const end = a.adj_out ?? a.clock_out
  return { start: new Date(a.adj_in ?? a.clock_in), end: end ? new Date(end) : null }
}

export function calcDay(rule: PayRule, a: AttendanceTimes): DayPay {
  const times = effectiveTimes(a)
  const end = times.end
  let start = times.start
  // 관리자가 출근 시각을 직접 고친 경우는 그 값을 그대로 씁니다.
  if (rule.early_clamp && !a.adj_in && a.work_date && rule.start_time) {
    const scheduled = kstAt(a.work_date, rule.start_time)
    if (start < scheduled) start = scheduled
  }
  const empty: DayPay = {
    incomplete: true,
    spanMin: 0,
    breakMin: 0,
    paidMin: 0,
    overtimeMin: 0,
    nightMin: 0,
    basePay: 0,
    overtimePay: 0,
    nightPay: 0,
    allowance: 0,
    extraPay: a.extra_pay ?? 0,
    deduction: a.deduction ?? 0,
    gross: a.extra_pay ?? 0,
    dailyTax: 0,
  }
  if (!end || end <= start) return empty

  const spanMin = Math.floor((end.getTime() - start.getTime()) / 60_000)
  const breakMin =
    a.break_override ??
    (rule.break_mode === 'auto'
      ? legalBreak(spanMin)
      : rule.break_mode === 'fixed'
        ? Math.min(rule.break_minutes, spanMin)
        : 0)
  const unit = Math.max(1, rule.round_unit || 1)
  const paidMin = Math.floor(Math.max(0, spanMin - breakMin) / unit) * unit
  const overtimeMin = Math.max(0, paidMin - 480)
  const nightMin = Math.min(paidMin, nightMinutes(start, end))

  let basePay = 0
  let overtimePay = 0
  let nightPay = 0
  if (rule.pay_type === 'daily') {
    basePay = paidMin > 0 ? rule.daily_wage : 0
  } else {
    const perMin = rule.hourly_wage / 60
    basePay = Math.floor(paidMin * perMin)
    if (rule.premium_enabled) {
      overtimePay = Math.floor(overtimeMin * perMin * 0.5)
      nightPay = Math.floor(nightMin * perMin * 0.5)
    }
  }
  const allowance = paidMin > 0 ? rule.allowance : 0
  const extraPay = a.extra_pay ?? 0
  const gross = basePay + overtimePay + nightPay + allowance + extraPay
  const dailyTax =
    rule.tax_type === 'daily'
      ? Math.floor(Math.max(0, gross - DAILY_INCOME_DEDUCTION) * DAILY_TAX_RATE)
      : 0

  return {
    incomplete: false,
    spanMin,
    breakMin,
    paidMin,
    overtimeMin,
    nightMin,
    basePay,
    overtimePay,
    nightPay,
    allowance,
    extraPay,
    deduction: a.deduction ?? 0,
    gross,
    dailyTax,
  }
}

/** 한 사람·한 공고의 정산 (지급 1회 기준으로 소액부징수 판단) */
export function settle(rule: PayRule, days: DayPay[]): Settlement {
  const sum = (k: keyof DayPay) => days.reduce((s, d) => s + (d[k] as number), 0)
  const gross = sum('gross')
  let incomeTax = 0
  if (rule.tax_type === 'daily') incomeTax = floor10(sum('dailyTax'))
  else if (rule.tax_type === 'business') incomeTax = floor10(gross * BUSINESS_TAX_RATE)
  if (incomeTax < MIN_WITHHOLDING) incomeTax = 0
  const localTax = floor10(incomeTax * 0.1)
  const insurance =
    rule.tax_type === 'daily' && rule.employment_insurance ? floor10(gross * EMPLOYMENT_INSURANCE_RATE) : 0
  const deduction = sum('deduction')
  const totalDeduction = incomeTax + localTax + insurance + deduction
  return {
    days: days.filter((d) => !d.incomplete).length,
    incomplete: days.filter((d) => d.incomplete).length,
    paidMin: sum('paidMin'),
    overtimeMin: sum('overtimeMin'),
    nightMin: sum('nightMin'),
    basePay: sum('basePay'),
    overtimePay: sum('overtimePay'),
    nightPay: sum('nightPay'),
    allowance: sum('allowance'),
    extraPay: sum('extraPay'),
    gross,
    incomeTax,
    localTax,
    insurance,
    deduction,
    totalDeduction,
    net: gross - totalDeduction,
  }
}

/** 공고에 적힌 근무시간대로 일했을 때의 하루 예상 지급액 */
export function estimateDay(job: PayRule & Pick<Job, 'start_date' | 'start_time' | 'end_time'>): DayPay {
  const start = kstAt(job.start_date, job.start_time)
  let end = kstAt(job.start_date, job.end_time)
  if (end <= start) end = new Date(end.getTime() + 24 * 3600_000)
  return calcDay(job, {
    work_date: job.start_date,
    clock_in: start.toISOString(),
    clock_out: end.toISOString(),
    adj_in: null,
    adj_out: null,
    break_override: null,
    extra_pay: 0,
    deduction: 0,
  })
}

export const TAX_LABEL: Record<Job['tax_type'], string> = {
  daily: '일용근로소득 (일 15만원 초과분 2.7% + 지방세)',
  business: '사업소득 3.3%',
  none: '공제 없음',
}

export function taxDescription(job: Pick<Job, 'tax_type' | 'employment_insurance'>): string {
  if (job.tax_type === 'none') return '공제 없음'
  if (job.tax_type === 'business') return '사업소득세 3% 및 지방소득세 0.3% 원천징수'
  const parts = ['일용근로소득세(일급 15만원 초과분의 2.7%) 및 지방소득세(소득세의 10%) 원천징수']
  if (job.employment_insurance) parts.push('고용보험료 근로자 부담분 0.9%')
  return parts.join(', ')
}

export function breakDescription(job: Pick<Job, 'break_mode' | 'break_minutes'>): string {
  if (job.break_mode === 'auto') return '근로시간 4시간 이상 30분, 8시간 이상 1시간 (근무 중 자유 이용)'
  if (job.break_mode === 'fixed') return `${job.break_minutes}분 (근무 중 자유 이용)`
  return '없음'
}
