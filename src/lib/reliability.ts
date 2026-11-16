import 'server-only'
import { allByIds, db } from './db'
import { DISMISS_NOTE } from './signals'
import { dateList, kstAt, kstDate } from './time'

/** dismissed: 불성실로 귀가 조치된 날 */
export type Reliability = { days: number; late: number; noShow: number; dismissed: number }

const LATE_MIN = 5 // 출퇴근 탭의 '지각' 표시와 같은 기준

/**
 * 근무자별 지난 근무 성실도: 근무한 날 수, 지각, 노쇼.
 * 노쇼 = 확정됐고 근무 가능하다고 한 지난 날짜에 출근 기록이 없음. 단, 그날 그 공고에 출근 기록이 하나도 없으면
 * (앱으로 출퇴근을 안 받은 날) 세지 않음. exceptJobId는 지금 보고 있는 공고를 빼고 셀 때.
 * 이 회사 근무만 셈 (다른 회사에서의 근무 기록은 보이지 않게)
 */
export async function reliabilityFor(companyId: string, userIds: string[], exceptJobId?: string): Promise<Record<string, Reliability>> {
  const out: Record<string, Reliability> = {}
  if (!userIds.length) return out
  for (const u of userIds) out[u] = { days: 0, late: 0, noShow: 0, dismissed: 0 }
  const today = kstDate()
  // 근무자가 많거나 기록이 쌓여도 빠짐없이: 100명씩 나눠 묻고, 1000줄이 넘으면 끝까지 나눠 받음 (지각·노쇼 숫자가 적게 보이지 않게)
  const [atts, apps] = await Promise.all([
    allByIds<{ user_id: string; job_id: string; work_date: string; clock_in: string; note: string | null; job: { start_time: string } | null }>(userIds, (ids, a, b) => {
      let q = db().from('attendance').select('id, user_id, job_id, work_date, clock_in, note, job:jobs(start_time)').eq('company_id', companyId).in('user_id', ids)
      if (exceptJobId) q = q.neq('job_id', exceptJobId)
      return q.order('id').range(a, b)
    }),
    allByIds<{ user_id: string; job_id: string; available_dates: string[] | null; job: { start_date: string; end_date: string } | null }>(userIds, (ids, a, b) => {
      let q = db().from('applications').select('id, user_id, job_id, available_dates, job:jobs(start_date, end_date)').eq('company_id', companyId).in('user_id', ids).eq('status', 'approved')
      if (exceptJobId) q = q.neq('job_id', exceptJobId)
      return q.order('id').range(a, b)
    }),
  ])
  const worked = new Set<string>()
  for (const a of atts) {
    const key = `${a.user_id}|${a.job_id}|${a.work_date}`
    if (worked.has(key)) continue
    worked.add(key)
    out[a.user_id].days++
    if (a.note?.startsWith(DISMISS_NOTE)) out[a.user_id].dismissed++
    if (a.job && (new Date(a.clock_in).getTime() - kstAt(a.work_date, a.job.start_time).getTime()) / 60_000 > LATE_MIN) out[a.user_id].late++
  }
  // 앱으로 출퇴근을 받은 날 (공고·날짜별로 누구라도 출근 기록이 있으면)
  const pastApps = apps.filter((a) => a.job && a.job.start_date < today)
  const jobIds = [...new Set(pastApps.map((a) => a.job_id))]
  const tracked = new Set(
    (
      await allByIds<{ job_id: string; work_date: string }>(jobIds, (ids, a, b) =>
        db().from('attendance').select('id, job_id, work_date').in('job_id', ids).order('id').range(a, b),
      )
    ).map((t) => `${t.job_id}|${t.work_date}`),
  )
  for (const a of pastApps) {
    for (const d of dateList(a.job!.start_date, a.job!.end_date)) {
      if (d >= today || (a.available_dates && !a.available_dates.includes(d))) continue
      if (tracked.has(`${a.job_id}|${d}`) && !worked.has(`${a.user_id}|${a.job_id}|${d}`)) out[a.user_id].noShow++
    }
  }
  return out
}
