import 'server-only'
import { db, must } from './db'
import { dateList, kstAt, kstDate } from './time'

export type Reliability = { days: number; late: number; noShow: number }

const LATE_MIN = 5 // 출퇴근 탭의 '지각' 표시와 같은 기준

/**
 * 근무자별 지난 근무 성실도: 근무한 날 수, 지각, 노쇼.
 * 노쇼 = 확정됐고 근무 가능하다고 한 지난 날짜에 출근 기록이 없음. 단, 그날 그 공고에 출근 기록이 하나도 없으면
 * (앱으로 출퇴근을 안 받은 날) 세지 않음. exceptJobId는 지금 보고 있는 공고를 빼고 셀 때.
 */
export async function reliabilityFor(userIds: string[], exceptJobId?: string): Promise<Record<string, Reliability>> {
  const out: Record<string, Reliability> = {}
  if (!userIds.length) return out
  for (const u of userIds) out[u] = { days: 0, late: 0, noShow: 0 }
  const today = kstDate()
  let attQ = db().from('attendance').select('user_id, job_id, work_date, clock_in, job:jobs(start_time)').in('user_id', userIds)
  let appQ = db()
    .from('applications')
    .select('user_id, job_id, available_dates, job:jobs(start_date, end_date)')
    .in('user_id', userIds)
    .eq('status', 'approved')
  if (exceptJobId) {
    attQ = attQ.neq('job_id', exceptJobId)
    appQ = appQ.neq('job_id', exceptJobId)
  }
  const [atts, apps] = await Promise.all([
    attQ.then((r) => must(r) as unknown as { user_id: string; job_id: string; work_date: string; clock_in: string; job: { start_time: string } | null }[]),
    appQ.then(
      (r) =>
        must(r) as unknown as {
          user_id: string
          job_id: string
          available_dates: string[] | null
          job: { start_date: string; end_date: string } | null
        }[],
    ),
  ])
  const worked = new Set<string>()
  for (const a of atts) {
    const key = `${a.user_id}|${a.job_id}|${a.work_date}`
    if (worked.has(key)) continue
    worked.add(key)
    out[a.user_id].days++
    if (a.job && (new Date(a.clock_in).getTime() - kstAt(a.work_date, a.job.start_time).getTime()) / 60_000 > LATE_MIN) out[a.user_id].late++
  }
  // 앱으로 출퇴근을 받은 날 (공고·날짜별로 누구라도 출근 기록이 있으면)
  const pastApps = apps.filter((a) => a.job && a.job.start_date < today)
  const jobIds = [...new Set(pastApps.map((a) => a.job_id))]
  const tracked = new Set(
    jobIds.length
      ? (must(await db().from('attendance').select('job_id, work_date').in('job_id', jobIds)) as { job_id: string; work_date: string }[]).map(
          (t) => `${t.job_id}|${t.work_date}`,
        )
      : [],
  )
  for (const a of pastApps) {
    for (const d of dateList(a.job!.start_date, a.job!.end_date)) {
      if (d >= today || (a.available_dates && !a.available_dates.includes(d))) continue
      if (tracked.has(`${a.job_id}|${d}`) && !worked.has(`${a.user_id}|${a.job_id}|${d}`)) out[a.user_id].noShow++
    }
  }
  return out
}
