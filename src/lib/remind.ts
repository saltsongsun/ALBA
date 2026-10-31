import 'server-only'
import { db, must } from './db'
import { tellWorkers } from './notify'
import { SIGNAL } from './signals'
import { fmtDate, hhmm, kstDate } from './time'
import type { Job } from './types'

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
      jobId: job.id,
      title: SIGNAL.remind,
      text: (uid) =>
        [
          ...base,
          unsigned.has(uid) && '✍️ 서명할 서류가 남았어요. 출근 전에 앱에서 먼저 서명해 주세요.',
          noContract.has(uid) &&
            (job.contract_method === 'paper'
              ? '📝 근로계약서는 내일 현장에서 종이로 작성해요.'
              : `📝 근로계약서를 전자계약(모두싸인 등)으로 먼저 서명해 주세요.${job.contract_url ? ` ${job.contract_url}` : ''}`),
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
