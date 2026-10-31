import 'server-only'
import { db, must } from './db'
import { tellWorkers } from './notify'
import { SIGNAL } from './signals'
import { fmtDate, hhmm, kstDate } from './time'
import type { Job, ShiftChange } from './types'

/** '09:00~18:00' */
export const span = (s: string, e: string) => `${hhmm(s)}~${hhmm(e)}`

/** 시작은 그대로이고 끝만 늦어지면 '연장' */
export function changeWord(c: Pick<ShiftChange, 'start_time' | 'end_time' | 'prev_start' | 'prev_end'>): string {
  return hhmm(c.start_time) === hhmm(c.prev_start) && hhmm(c.end_time) > hhmm(c.prev_end) ? '연장' : '변경'
}

/** 그날 이 근무자가 동의한 근무시간 (가장 최근 것). 출근 기록을 만들 때 함께 넣음 */
export async function agreedShiftFor(jobId: string, userId: string, date: string): Promise<{ sched_start?: string; sched_end?: string }> {
  const rows = must(
    await db()
      .from('shift_changes')
      .select('work_date, start_time, end_time, status, created_at')
      .eq('job_id', jobId)
      .eq('user_id', userId)
      .eq('work_date', date)
      .eq('status', 'agreed')
      .order('created_at', { ascending: false })
      .limit(5),
  ) as Pick<ShiftChange, 'work_date' | 'start_time' | 'end_time' | 'status' | 'created_at'>[]
  const hit = rows.sort((x, y) => y.created_at.localeCompare(x.created_at)).find((r) => r.work_date === date && r.status === 'agreed')
  return hit ? { sched_start: hit.start_time, sched_end: hit.end_time } : {}
}

/** 동의한 변경을 출근 기록에 반영 (그날만 바꾼 것은 그날, 전체 일정은 요청한 날 이후) */
export async function applyAgreedShift(c: ShiftChange) {
  const q = db().from('attendance').update({ sched_start: c.start_time, sched_end: c.end_time }).eq('job_id', c.job_id).eq('user_id', c.user_id)
  if (c.work_date) await q.eq('work_date', c.work_date)
  else await q.gte('work_date', kstDate(c.created_at))
}

/**
 * 근무시간 변경 동의 요청: 사람마다 요청을 남기고(같은 날 기다리던 요청은 대체) 문의함·휴대폰으로 알림.
 * prevOf: 그 사람의 지금 시간. 바뀌는 게 없는 사람은 뺌. 요청한 사람 수를 돌려줌
 */
export async function requestShiftChange(o: {
  job: Pick<Job, 'id' | 'title'>
  adminId: string
  userIds: string[]
  workDate: string | null
  start: string
  end: string
  reason: string | null
  prevOf: (uid: string) => { start: string; end: string }
  notify?: boolean
}): Promise<number> {
  const rows = o.userIds
    .map((uid) => ({ uid, prev: o.prevOf(uid) }))
    .filter(({ prev }) => hhmm(prev.start) !== hhmm(o.start) || hhmm(prev.end) !== hhmm(o.end))
    .map(({ uid, prev }) => ({
      job_id: o.job.id,
      user_id: uid,
      work_date: o.workDate,
      start_time: o.start,
      end_time: o.end,
      prev_start: prev.start,
      prev_end: prev.end,
      reason: o.reason,
      requested_by: o.adminId,
      status: 'pending' as const,
    }))
  if (!rows.length) return 0
  // 같은 날(또는 전체 일정)에 답을 기다리던 요청은 새 요청으로 대체
  const old = db()
    .from('shift_changes')
    .update({ status: 'superseded' })
    .eq('job_id', o.job.id)
    .in('user_id', rows.map((r) => r.user_id))
    .eq('status', 'pending')
  must(await (o.workDate ? old.eq('work_date', o.workDate) : old.is('work_date', null)))
  must(await db().from('shift_changes').insert(rows))
  if (o.notify !== false) {
    const when = o.workDate ? `${fmtDate(o.workDate)} ` : '전체 일정 '
    const prevText = new Map(rows.map((r) => [r.user_id, span(r.prev_start, r.prev_end)]))
    await tellWorkers(
      rows.map((r) => r.user_id),
      {
        senderId: o.adminId,
        jobId: o.job.id,
        title: SIGNAL.change,
        text: (uid) =>
          [
            `${o.job.title} · ${when}근무시간이 ${prevText.get(uid)} → ${span(o.start, o.end)}으로 바뀌었어요.`,
            o.reason && `사유: ${o.reason}`,
            "계속 근무하실 수 있는지 앱 '내 근무'에서 알려 주세요.",
          ]
            .filter(Boolean)
            .join('\n'),
        tag: `shift-${o.job.id}`,
      },
    )
  }
  return rows.length
}

/** 공고 전체 시간을 바꾸기 전에, 이미 일한 기록은 그때 시간으로 고정 (지난 급여가 바뀌지 않게) */
export async function freezeAttendance(jobId: string, start: string, end: string) {
  await db().from('attendance').update({ sched_start: start, sched_end: end }).eq('job_id', jobId).is('sched_start', null)
}
