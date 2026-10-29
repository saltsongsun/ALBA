import 'server-only'
import { db, must } from './db'
import { calcDay, settle } from './pay'
import { monthRange } from './time'
import type { Attendance, Job, TaxType } from './types'

export type MonthUser = {
  id: string
  name: string
  phone: string
  birth_date: string | null
  rrn_enc: string | null
  is_foreigner: boolean
}

export type MonthRow = {
  user: MonthUser
  dates: string[]
  paidMin: number
  gross: number
  incomeTax: number
  localTax: number
  insurance: number
  net: number
  byTax: Record<TaxType, { gross: number; incomeTax: number; localTax: number; days: number; paidMin: number }>
  jobs: string[]
}

/** 한 달(근무일 기준) 근무자별 합계. 소득세는 공고(지급)별로 계산해 더합니다. */
export async function monthlyRows(ym: string): Promise<MonthRow[]> {
  const [from, to] = monthRange(ym)
  const atts = must(
    await db()
      .from('attendance')
      .select('*, job:jobs(*), user:users(id, name, phone, birth_date, rrn_enc, is_foreigner)')
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date'),
  ) as (Attendance & { job: Job; user: MonthUser })[]

  const out = new Map<string, MonthRow>()
  const groups = new Map<string, typeof atts>()
  for (const a of atts) {
    if (!a.job || !a.user) continue
    const key = `${a.user_id}|${a.job_id}`
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  for (const rows of groups.values()) {
    const { job, user } = rows[0]
    const days = rows.map((r) => calcDay(job, r))
    const s = settle(job, days)
    const row =
      out.get(user.id) ??
      ({
        user,
        dates: [],
        paidMin: 0,
        gross: 0,
        incomeTax: 0,
        localTax: 0,
        insurance: 0,
        net: 0,
        byTax: {
          daily: { gross: 0, incomeTax: 0, localTax: 0, days: 0, paidMin: 0 },
          business: { gross: 0, incomeTax: 0, localTax: 0, days: 0, paidMin: 0 },
          none: { gross: 0, incomeTax: 0, localTax: 0, days: 0, paidMin: 0 },
        },
        jobs: [],
      } satisfies MonthRow)
    rows.forEach((r, i) => {
      if (!days[i].incomplete && !row.dates.includes(r.work_date)) row.dates.push(r.work_date)
    })
    row.paidMin += s.paidMin
    row.gross += s.gross
    row.incomeTax += s.incomeTax
    row.localTax += s.localTax
    row.insurance += s.insurance
    row.net += s.net
    const t = row.byTax[job.tax_type]
    t.gross += s.gross
    t.incomeTax += s.incomeTax
    t.localTax += s.localTax
    t.days += s.days
    t.paidMin += s.paidMin
    row.jobs.push(job.title)
    out.set(user.id, row)
  }
  return [...out.values()].map((r) => ({ ...r, dates: r.dates.sort() })).sort((a, b) => a.user.name.localeCompare(b.user.name, 'ko'))
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // 엑셀에서 한글이 깨지지 않도록 BOM
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}
