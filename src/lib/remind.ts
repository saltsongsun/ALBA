import 'server-only'
import { db, must } from './db'
import { tellWorkers } from './notify'
import { scheduledEnd, shiftOf } from './pay'
import { contractNameOf, myWorkTab } from './members'
import { SIGNAL } from './signals'
import { fmtDate, hhmm, kstDate } from './time'
import type { Attendance, Job } from './types'

/**
 * 근무 전날 안내: 내일 근무하는 확정자에게 시간·장소·집결·복장·준비물과 남은 서류를 알림.
 * 공고·날짜마다 한 번만 (audit_logs에 'remind.day'로 남겨 두 번 불려도 다시 보내지 않음)
 */
export async function sendDayBeforeReminders(now = new Date()): Promise<{ date: string; jobs: number; sent: number }> {
  const tomorrow = kstDate(new Date(now.getTime() + 86_400_000))
  const jobs = (
    must(
      await db().from('jobs').select('*').in('status', ['open', 'closed']).lte('start_date', tomorrow).gte('end_date', tomorrow),
    ) as Job[]
  ).filter((j) => j.start_date <= tomorrow && j.end_date >= tomorrow)
  let sent = 0
  let done = 0
  for (const job of jobs) {
    const key = `${job.id}|${tomorrow}`
    const { count } = await db().from('audit_logs').select('id', { count: 'exact', head: true }).eq('action', 'remind.day').eq('detail', key)
    if (count) continue
    // 먼저 보냈다고 남겨서 동시에 두 번 불려도 한 번만 가게
    must(await db().from('audit_logs').insert({ actor_id: null, action: 'remind.day', detail: key }))
    const [apps, docs] = await Promise.all([
      db().from('applications').select('user_id, available_dates, contract_received_at').eq('job_id', job.id).eq('status', 'approved'),
      db().from('signed_docs').select('user_id').eq('job_id', job.id).eq('status', 'pending'),
    ])
    const list = (must(apps) as { user_id: string; available_dates: string[] | null; contract_received_at: string | null }[]).filter(
      (a) => !a.available_dates || a.available_dates.includes(tomorrow),
    )
    const to = list.map((a) => a.user_id)
    // 종이·다른 서비스로 받는 근로계약서를 아직 안 받은 사람
    const noContract = new Set(job.contract_method !== 'app' ? list.filter((a) => !a.contract_received_at).map((a) => a.user_id) : [])
    const unsigned = new Set((must(docs) as { user_id: string }[]).map((d) => d.user_id))
    const base = [
      `${job.title}`,
      `${fmtDate(tomorrow)} ${hhmm(job.start_time)}~${hhmm(job.end_time)}${job.location_name ? ` · ${job.location_name}` : ''}`,
      job.meeting_point && `집결: ${job.meeting_point}`,
      job.dress_code && `복장: ${job.dress_code}`,
      job.supplies && `준비물: ${job.supplies}`,
    ].filter(Boolean)
    sent += await tellWorkers(to, {
      senderId: null,
      companyId: job.company_id,
      jobId: job.id,
      title: SIGNAL.remind,
      text: (uid) =>
        [
          ...base,
          unsigned.has(uid) && '✍️ 서명할 서류가 남았어요. 출근 전에 앱에서 먼저 서명해 주세요.',
          noContract.has(uid) &&
            (job.contract_method === 'paper'
              ? `📝 ${contractNameOf(job.audience)}는 내일 현장에서 종이로 작성해요.`
              : `📝 ${contractNameOf(job.audience)}를 전자계약(모두싸인 등)으로 먼저 서명해 주세요.${job.contract_url ? ` ${job.contract_url}` : ''}`),
          '늦거나 못 오게 되면 앱에서 바로 알려 주세요.',
        ]
          .filter(Boolean)
          .join('\n'),
      tag: `remind-${job.id}-${tomorrow}`,
    })
    done++
  }
  return { date: tomorrow, jobs: done, sent }
}

/**
 * 근무 종료를 깜빡한 지난 근무(최근 2주): 근무자에게 '끝난 시각을 알려 주세요' (기록마다 한 번만, audit_logs 'remind.clockout').
 * 근무자 앱 '내 근무'에 예정 종료 시각·직접 입력으로 정리하는 카드가 있음
 */
export async function sendForgotClockOutReminders(now = new Date()): Promise<number> {
  const today = kstDate(now)
  const since = kstDate(new Date(now.getTime() - 14 * 86_400_000))
  type Row = Pick<Attendance, 'id' | 'user_id' | 'job_id' | 'company_id' | 'work_date' | 'clock_out' | 'sched_start' | 'sched_end'> & {
    job: Pick<Job, 'title' | 'start_time' | 'end_time' | 'audience'> | null
  }
  const open = (
    must(
      await db()
        .from('attendance')
        .select('id, user_id, job_id, company_id, work_date, clock_out, sched_start, sched_end, job:jobs(title, start_time, end_time, audience)')
        .is('clock_out', null)
        .lt('work_date', today)
        .gte('work_date', since)
        .limit(200),
    ) as unknown as Row[]
  ).filter((a) => !a.clock_out && a.work_date < today && a.work_date >= since && a.job && scheduledEnd(shiftOf(a.job, a), a.work_date) <= now)
  if (!open.length) return 0
  const done = new Set(
    (
      must(
        await db()
          .from('audit_logs')
          .select('detail')
          .eq('action', 'remind.clockout')
          .in('detail', open.map((a) => a.id)),
      ) as { detail: string }[]
    ).map((r) => r.detail),
  )
  let sent = 0
  for (const a of open) {
    if (done.has(a.id)) continue
    // 먼저 보냈다고 남겨서 동시에 두 번 불려도 한 번만 가게
    must(await db().from('audit_logs').insert({ actor_id: null, action: 'remind.clockout', detail: a.id }))
    sent += await tellWorkers([a.user_id], {
      senderId: null,
      companyId: a.company_id,
      jobId: a.job_id,
      title: '⏰ 근무 종료 확인',
      text: `${a.job!.title} · ${fmtDate(a.work_date)} 근무 종료를 누르지 않았어요. 앱 ‘${myWorkTab(a.job!.audience)}’에서 끝난 시각을 알려 주세요.`,
      url: '/me',
      button: 'clock-out',
      tag: `forgot-${a.id}`,
    })
  }
  return sent
}

/**
 * 같은 행사에서 누가 근무 종료를 누르면: 예정 종료 시각이 지났는데 아직 근무 중인 다른 사람에게 '근무 종료를 눌러 주세요' (기록마다 한 번).
 * 사용자 요청 2026-11-06 "근무종료 안누르고 가는 사람들이 있어서 근무종료 누르게 해줘" — 보통 함께 끝나므로 다른 사람이 누르는 순간이 가장 알맞은 때.
 * (자주 도는 예약 작업 없이도 같은 날 바로 알림. 다음 날 저녁 cron의 sendForgotClockOutReminders는 그대로)
 */
export async function remindOthersToClockOut(jobId: string, workDate: string, exceptUserId: string | null, now = new Date()): Promise<number> {
  const { data: j } = await db().from('jobs').select('title, start_time, end_time, company_id').eq('id', jobId).maybeSingle()
  const job = j as Pick<Job, 'title' | 'start_time' | 'end_time' | 'company_id'> | null
  if (!job) return 0
  const open = (
    must(
      await db().from('attendance').select('id, user_id, clock_out, sched_start, sched_end').eq('job_id', jobId).eq('work_date', workDate).is('clock_out', null),
    ) as Pick<Attendance, 'id' | 'user_id' | 'clock_out' | 'sched_start' | 'sched_end'>[]
  ).filter((a) => !a.clock_out && a.user_id !== exceptUserId && scheduledEnd(shiftOf(job, a), workDate) <= now)
  if (!open.length) return 0
  const done = new Set(
    (
      must(await db().from('audit_logs').select('detail').eq('action', 'remind.clockout_now').in('detail', open.map((a) => a.id))) as { detail: string }[]
    ).map((r) => r.detail),
  )
  let sent = 0
  for (const a of open) {
    if (done.has(a.id)) continue
    // 먼저 남겨서 두 사람이 동시에 눌러도 한 번만
    must(await db().from('audit_logs').insert({ actor_id: null, action: 'remind.clockout_now', detail: a.id }))
    sent += await tellWorkers([a.user_id], {
      senderId: null,
      companyId: job.company_id,
      jobId,
      title: '🏁 근무 종료를 눌러 주세요',
      text: `${job.title} · 함께 일한 분들이 근무를 마쳤어요. 일이 끝났으면 앱에서 ‘근무 종료’를 눌러 주세요 (예정 종료 ${hhmm(shiftOf(job, a).end_time)}).`,
      url: '/me#clock',
      tag: `clockout-now-${a.id}`,
      // 문의 채팅에서도 바로 근무 종료
      button: 'clock-out',
    })
  }
  return sent
}
