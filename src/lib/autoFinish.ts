import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { db } from './db'
import { scheduledEnd, shiftOf } from './pay'
import { adminIds, sendPush } from './push'
import type { Job } from './types'

type FinishJob = Pick<Job, 'id' | 'title' | 'status' | 'company_id' | 'end_date' | 'start_time' | 'end_time'>

/**
 * 행사 마지막 날, 근무자가 모두 퇴근하면 '행사 종료'로 바꿈 (사용자 요청 2026-11-06 "아르바이트 전원 퇴근하면 행사종료해줘").
 * 퇴근이 기록될 때마다 (근무자 종료·관리자 일괄 종료·귀가 조치·나중에 종료 입력·기록 수정) 그 공고·날짜로 불러서 확인함.
 *
 * 종료하는 때 (모두 만족):
 * · 모집 중·마감 상태의 공고이고, 그날이 행사 마지막 날
 * · 그날 근무 기록이 1건 이상이고, 아직 근무 중인 사람이 없음
 * · 그날 근무하기로 한 확정자가 모두 기록이 있음 — 안 온 사람이 있으면 예정 종료 시각이 지난 뒤에만 (늦게 오는 사람을 두고 끝내지 않게)
 * 되돌리기: 관리자가 공고 '더보기 → 모집 열기'.
 * 반환: 이번에 종료했으면 true
 */
export async function finishIfAllOut(jobId: string, workDate: string): Promise<boolean> {
  const { data: j } = await db().from('jobs').select('id, title, status, company_id, end_date, start_time, end_time').eq('id', jobId).maybeSingle()
  const job = j as FinishJob | null
  if (!job || !['open', 'closed'].includes(job.status) || workDate !== job.end_date) return false
  const [{ data: atts }, { data: apps }] = await Promise.all([
    db().from('attendance').select('user_id, clock_out').eq('job_id', jobId).eq('work_date', workDate),
    db().from('applications').select('user_id, available_dates').eq('job_id', jobId).eq('status', 'approved'),
  ])
  const rows = (atts ?? []) as { user_id: string; clock_out: string | null }[]
  if (!rows.length || rows.some((a) => !a.clock_out)) return false
  const came = new Set(rows.map((a) => a.user_id))
  const due = ((apps ?? []) as { user_id: string; available_dates: string[] | null }[]).filter((a) => !a.available_dates || a.available_dates.includes(workDate))
  const missing = due.filter((a) => !came.has(a.user_id)).length
  if (missing > 0 && Date.now() < scheduledEnd(shiftOf(job), workDate).getTime()) return false

  // 동시에 두 사람이 마지막으로 퇴근해도 한 번만 (상태가 그대로일 때만 바꿈)
  const { data: changed } = await db().from('jobs').update({ status: 'done' }).eq('id', jobId).in('status', ['open', 'closed']).select('id')
  if (!(changed as { id: string }[] | null)?.length) return false
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/admin/jobs')
  revalidatePath('/admin')
  revalidatePath('/')
  const n = came.size
  after(async () =>
    sendPush(await adminIds(job.company_id), {
      title: '🏁 행사 종료 · 전원 퇴근',
      body: `${job.title} · 근무자 ${n}명이 모두 퇴근해서 행사를 종료했어요. 정산 탭에서 확인해 주세요.`,
      url: `/admin/jobs/${jobId}?tab=pay`,
      tag: `finish-${jobId}`,
    }),
  )
  return true
}

/** 관리자 화면 안내 문구 끝에 붙이는 말 */
export const FINISHED_NOTE = ' 모두 퇴근해서 행사를 종료했어요.'
