import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/ui'
import Watermark from '@/components/Watermark'
import { companyJob } from '@/lib/company'
import { getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { scheduleText } from '@/lib/docs'
import { requireAdmin } from '@/lib/session'
import { dateList, fmtDateLong, kstDate, kstTime } from '@/lib/time'
import { isDate } from '@/lib/validate'
import { viewerMark } from '@/lib/watermark'

export const metadata: Metadata = { title: '출석부' }

/**
 * 종이 출석부 (관리자만): 현장에서 휴대폰·인터넷이 안 될 때 이름·배치·연락처·출근·퇴근·서명 칸.
 * 이미 앱으로 찍힌 출근·퇴근 시각은 채워 둠 · 관리자 시나리오 '현장 인터넷이 안 돼서 종이 출석부가 필요해요'
 */
export default async function RosterPrint(props: { params: Promise<{ jobId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin()
  const { jobId } = await props.params
  const sp = await props.searchParams
  const job = await companyJob(admin, jobId)
  if (!job) notFound()
  const dates = dateList(job.start_date, job.end_date)
  const today = kstDate()
  const date = typeof sp.date === 'string' && isDate(sp.date) && dates.includes(sp.date) ? sp.date : dates.includes(today) ? today : dates[0]
  const [settings, apps, atts] = await Promise.all([
    getSettings(admin.companyId),
    db()
      .from('applications')
      .select('user_id, position, available_dates, status, user:users(name, phone)')
      .eq('company_id', admin.companyId)
      .eq('job_id', job.id)
      .eq('status', 'approved')
      .then((r) => must(r) as unknown as { user_id: string; position: string | null; available_dates: string[] | null; status: string; user: { name: string; phone: string } | null }[]),
    db()
      .from('attendance')
      .select('user_id, clock_in, clock_out, adj_in, adj_out')
      .eq('company_id', admin.companyId)
      .eq('job_id', job.id)
      .eq('work_date', date)
      .then((r) => must(r) as { user_id: string; clock_in: string; clock_out: string | null; adj_in: string | null; adj_out: string | null }[]),
  ])
  const att = new Map(atts.map((a) => [a.user_id, a]))
  const rows = apps
    .filter((a) => a.status === 'approved' && a.user && (!a.available_dates || a.available_dates.includes(date)))
    .sort((a, b) => (a.position ?? '힣').localeCompare(b.position ?? '힣', 'ko') || a.user!.name.localeCompare(b.user!.name, 'ko'))
  // 빈 줄 몇 개: 현장에서 새로 온 사람을 손으로 적게
  const blanks = Math.max(3, Math.min(10, Math.ceil(rows.length * 0.2)))

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={`/admin/jobs/${job.id}?tab=att&date=${date}`} className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 출퇴근으로
        </Link>
        {dates.length > 1 && (
          <form className="flex gap-2">
            <select name="date" defaultValue={date} className="input py-1.5 text-sm">
              {dates.map((d) => (
                <option key={d} value={d}>
                  {fmtDateLong(d)}
                </option>
              ))}
            </select>
            <button className="btn-gray btn-sm">바꾸기</button>
          </form>
        )}
        <PrintButton label="인쇄 / PDF 저장" />
      </div>
      <article className="print-sheet card relative px-4 py-6 sm:px-8" data-roster>
        <Watermark text={viewerMark(admin)} />
        <header className="mb-4 space-y-0.5">
          <h1 className="text-xl font-extrabold">출석부 · {job.title}</h1>
          <p className="text-sm text-sub">
            {settings.company_name} · {fmtDateLong(date)} {scheduleText(job)}
            {job.location_name && ` · ${job.location_name}`} · 확정 {rows.length}명
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-2.5 [&_th]:border [&_th]:border-line [&_th]:bg-bg [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>이름</th>
                <th>배치</th>
                <th>연락처</th>
                <th className="w-16">출근</th>
                <th className="w-16">퇴근</th>
                <th className="w-24">서명</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const t = att.get(a.user_id)
                return (
                  <tr key={a.user_id} data-roster-row>
                    <td className="tabular-nums text-mute">{i + 1}</td>
                    <td className="font-semibold">{a.user!.name}</td>
                    <td>{a.position ?? ''}</td>
                    <td className="whitespace-nowrap tabular-nums">{phoneFmt(a.user!.phone)}</td>
                    <td className="tabular-nums">{t ? kstTime(t.adj_in ?? t.clock_in) : ''}</td>
                    <td className="tabular-nums">{t?.clock_out ? kstTime(t.adj_out ?? t.clock_out) : ''}</td>
                    <td />
                  </tr>
                )
              })}
              {Array.from({ length: blanks }, (_, i) => (
                <tr key={`b${i}`}>
                  <td className="tabular-nums text-mute">{rows.length + i + 1}</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-mute">앱으로 찍힌 출근·퇴근은 미리 채워 두었어요. 손으로 적은 시각은 출퇴근 탭에서 ‘기록 보기 · 수정’으로 옮겨 주세요.</p>
      </article>
    </div>
  )
}
