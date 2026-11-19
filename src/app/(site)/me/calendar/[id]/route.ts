import { getSettings } from '@/lib/data'
import { db } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { buildIcs } from '@/lib/ics'
import { getUser, siteOrigin } from '@/lib/session'
import { dateList } from '@/lib/time'
import type { Job } from '@/lib/types'
import { isUuid } from '@/lib/validate'

/** 확정된 근무를 휴대폰 달력에 넣기 (본인 지원만, 근무 가능한 날짜마다 하나씩) */
export async function GET(_: Request, ctx: RouteContext<'/me/calendar/[id]'>) {
  const { id } = await ctx.params
  const user = await getUser()
  if (!user) return new Response(null, { status: 401 })
  if (!isUuid(id)) return new Response(null, { status: 404 })
  const { data } = await db()
    .from('applications')
    .select('id, user_id, status, available_dates, position, job:jobs(*)')
    .eq('id', id)
    .maybeSingle()
  const app = data as { id: string; user_id: string; status: string; available_dates: string[] | null; position: string | null; job: Job | null } | null
  if (!app || app.user_id !== user.id || app.status !== 'approved' || !app.job) return new Response(null, { status: 404 })
  const job = app.job
  const days = dateList(job.start_date, job.end_date).filter((d) => !app.available_dates || app.available_dates.includes(d))
  const [origin, company] = await Promise.all([siteOrigin(), getSettings(job.company_id).catch(() => null)])
  // 현장 담당 번호가 없으면 회사 문의 번호 (공고 화면과 같은 순서: 현장 담당 → 회사 문의 담당 → 회사 전화)
  const coPhone = company?.contact_phone || company?.company_phone || null
  const description = [
    // 여러 회사에서 일하면 달력에서도 어느 회사 근무인지 바로 (회사 이름을 맨 앞에)
    company?.company_name && `회사: ${company.company_name}`,
    job.meeting_point && `집결: ${job.meeting_point}`,
    app.position && `배치: ${app.position}`,
    job.dress_code && `복장: ${job.dress_code}`,
    job.supplies && `준비물: ${job.supplies}`,
    job.manager_phone
      ? `담당: ${job.manager_name ?? ''} ${phoneFmt(job.manager_phone)}`.trim()
      : coPhone && `문의: ${(company?.contact_phone && company.contact_name) || company?.company_name || ''} ${phoneFmt(coPhone)}`.trim(),
    `출퇴근: ${origin}/me`,
  ]
    .filter(Boolean)
    .join('\n')
  const ics = buildIcs(
    days.map((d) => ({
      uid: `${app.id}-${d}@socket-alba`,
      date: d,
      start: job.start_time,
      end: job.end_time,
      title: job.title,
      location: [job.location_name, job.address].filter(Boolean).join(' '),
      description,
    })),
  )
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="happywork.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
