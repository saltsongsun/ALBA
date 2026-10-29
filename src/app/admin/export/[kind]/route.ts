import { decrypt } from '@/lib/crypto'
import { audit, getJob } from '@/lib/data'
import { db, must } from '@/lib/db'
import { calcDay, settle } from '@/lib/pay'
import { monthlyRows, toCsv } from '@/lib/reports'
import { getUser } from '@/lib/session'
import type { Attendance, UserRow } from '@/lib/types'
import { formatRrn, isUuid } from '@/lib/validate'

const hours = (min: number) => Math.round((min / 60) * 100) / 100

function csvResponse(name: string, body: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(req: Request, ctx: RouteContext<'/admin/export/[kind]'>) {
  const admin = await getUser()
  if (!admin || admin.role !== 'admin') return new Response('권한이 없습니다.', { status: 403 })
  const { kind } = await ctx.params
  const url = new URL(req.url)
  const month = url.searchParams.get('month') ?? ''
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month)

  if (kind === 'settlement') {
    const jobId = url.searchParams.get('job') ?? ''
    const job = isUuid(jobId) ? await getJob(jobId) : null
    if (!job) return new Response('공고를 찾을 수 없습니다.', { status: 404 })
    const atts = must(await db().from('attendance').select('*').eq('job_id', jobId)) as Attendance[]
    const ids = [...new Set(atts.map((a) => a.user_id))]
    const users = ids.length
      ? (must(
          await db().from('users').select('id, name, phone, birth_date, bank_name, bank_account_enc, account_holder').in('id', ids),
        ) as Pick<UserRow, 'id' | 'name' | 'phone' | 'birth_date' | 'bank_name' | 'bank_account_enc' | 'account_holder'>[])
      : []
    const rows = users
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((u) => {
        const mine = atts.filter((a) => a.user_id === u.id)
        const s = settle(job, mine.map((a) => calcDay(job, a)))
        const paid = mine.filter((a) => a.clock_out).every((a) => a.paid)
        return [
          u.name,
          u.birth_date,
          u.phone,
          u.bank_name,
          decrypt(u.bank_account_enc),
          u.account_holder ?? u.name,
          s.days,
          hours(s.paidMin),
          s.basePay,
          s.overtimePay,
          s.nightPay,
          s.allowance,
          s.extraPay,
          s.gross,
          s.incomeTax,
          s.localTax,
          s.insurance,
          s.deduction,
          s.totalDeduction,
          s.net,
          paid ? '지급완료' : '미지급',
        ]
      })
    await audit(admin.id, 'export.settlement', null, job.title)
    return csvResponse(
      `정산표_${job.title}.csv`,
      toCsv([
        ['성명', '생년월일', '연락처', '은행', '계좌번호', '예금주', '근무일수', '인정시간', '기본급', '연장수당', '야간수당', '수당', '기타지급', '지급총액', '소득세', '지방소득세', '고용보험', '기타공제', '공제합계', '실지급액', '지급여부'],
        ...rows,
      ]),
    )
  }

  if (kind === 'workers') {
    const users = must(
      await db().from('users').select('id, name, gender, birth_date, phone, address, active, created_at').eq('role', 'worker').order('name'),
    ) as Pick<UserRow, 'id' | 'name' | 'gender' | 'birth_date' | 'phone' | 'address' | 'active' | 'created_at'>[]
    const atts = must(await db().from('attendance').select('user_id, job_id, work_date')) as Pick<Attendance, 'user_id' | 'job_id' | 'work_date'>[]
    const rows = users.map((u) => {
      const mine = atts.filter((a) => a.user_id === u.id).map((a) => a.work_date).sort()
      return [
        u.name,
        u.gender === 'M' ? '남' : u.gender === 'F' ? '여' : '',
        u.birth_date,
        u.phone,
        u.address,
        mine[0] ?? '',
        mine.at(-1) ?? '',
        new Set(atts.filter((a) => a.user_id === u.id).map((a) => a.job_id)).size,
        mine.length,
        u.created_at.slice(0, 10),
        u.active ? '' : '탈퇴',
      ]
    })
    await audit(admin.id, 'export.workers')
    return csvResponse(
      '근로자명부.csv',
      toCsv([['성명', '성별', '생년월일', '연락처', '주소', '최초근무일', '최근근무일', '근무행사수', '근무일수', '가입일', '비고'], ...rows]),
    )
  }

  if (!validMonth) return new Response('month=YYYY-MM 값이 필요합니다.', { status: 400 })
  const data = await monthlyRows(month)
  const ym = month.replace('-', '')

  if (kind === 'daily-income') {
    const rows = data
      .filter((r) => r.byTax.daily.gross > 0)
      .map((r) => [
        ym,
        r.user.name,
        formatRrn(decrypt(r.user.rrn_enc) ?? ''),
        r.user.is_foreigner ? '외국인' : '내국인',
        r.byTax.daily.days,
        r.byTax.daily.gross,
        0,
        r.byTax.daily.incomeTax,
        r.byTax.daily.localTax,
        r.user.phone,
      ])
    await audit(admin.id, 'export.daily_income', null, `${month} ${rows.length}명 (주민번호 포함)`)
    return csvResponse(
      `일용근로소득_지급명세_${month}.csv`,
      toCsv([['귀속연월', '성명', '주민등록번호', '내외국인', '근무일수', '과세소득', '비과세소득', '소득세', '지방소득세', '연락처'], ...rows]),
    )
  }

  if (kind === 'business-income') {
    const rows = data
      .filter((r) => r.byTax.business.gross > 0)
      .map((r) => [
        ym,
        r.user.name,
        formatRrn(decrypt(r.user.rrn_enc) ?? ''),
        r.user.is_foreigner ? '외국인' : '내국인',
        '',
        r.byTax.business.gross,
        '3%',
        r.byTax.business.incomeTax,
        r.byTax.business.localTax,
      ])
    await audit(admin.id, 'export.business_income', null, `${month} ${rows.length}명 (주민번호 포함)`)
    return csvResponse(
      `사업소득_간이지급명세_${month}.csv`,
      toCsv([['귀속연월', '성명', '주민등록번호', '내외국인', '업종코드', '지급액', '세율', '소득세', '지방소득세'], ...rows]),
    )
  }

  if (kind === 'employment') {
    const rows = data
      .filter((r) => r.byTax.daily.gross > 0)
      .map((r) => {
        const days = r.byTax.daily.days
        return [
          ym,
          r.user.name,
          formatRrn(decrypt(r.user.rrn_enc) ?? ''),
          r.dates.map((d) => Number(d.slice(8))).join(' '),
          days,
          days ? Math.round((r.byTax.daily.paidMin / 60 / days) * 10) / 10 : 0,
          r.byTax.daily.gross,
          r.byTax.daily.gross,
          r.user.phone,
        ]
      })
    await audit(admin.id, 'export.employment', null, `${month} ${rows.length}명 (주민번호 포함)`)
    return csvResponse(
      `근로내용확인신고_${month}.csv`,
      toCsv([['귀속연월', '성명', '주민등록번호', '근로일자', '근로일수', '일평균근로시간', '보수총액(과세)', '임금총액', '연락처'], ...rows]),
    )
  }

  return new Response('알 수 없는 자료입니다.', { status: 404 })
}
