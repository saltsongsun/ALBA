import Link from 'next/link'
import { db } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { scheduledEnd, shiftOf } from '@/lib/pay'
import { hhmm, kstDate, kstTime } from '@/lib/time'
import type { Attendance, Job } from '@/lib/types'
import Icon from './Icon'
import { ClockPanel } from './worker'

/**
 * 문의 채팅 안의 근무 시작·종료 (담당자가 '근무 시작하러 가기'·'근무 종료하러 가기' 버튼을 보내면 그 말풍선 아래에 진짜 버튼).
 * 내 근무의 오늘 근무 칸과 같은 버튼 (위치 확인·서명 먼저·두 번 눌러 종료 그대로) — 근무 시작 버튼을 못 찾는 근무자가 채팅에서 바로 누름.
 * 기록 규칙은 서버(근무 시작·종료)가 그대로 확인 · 이 회사의 오늘 확정 근무만
 */
export default async function ChatClock({ userId, companyId }: { userId: string; companyId: string }) {
  const today = kstDate()
  const { data: appRows } = await db()
    .from('applications')
    .select('id, status, available_dates, job:jobs(*)')
    .eq('user_id', userId)
    .eq('status', 'approved')
  const apps = ((appRows ?? []) as unknown as { id: string; status: string; available_dates: string[] | null; job: Job | null }[]).filter(
    (a) => a.status === 'approved' && a.job && a.job.company_id === companyId && a.job.status !== 'cancelled' && a.job.start_date <= today && a.job.end_date >= today,
  )
  const app = apps.find((a) => !a.available_dates || a.available_dates.includes(today)) ?? apps[0]
  const fallback = (
    <Link href="/me#clock" data-chat-button="clock-in" className="flex items-center gap-2 rounded-2xl bg-brand-600 py-2.5 pr-3.5 pl-3 text-[15px] font-bold text-white shadow-sm transition active:scale-95">
      <Icon name="clock" className="shrink-0 text-lg" />
      <span className="min-w-0 truncate">내 근무에서 보기</span>
      <span aria-hidden className="shrink-0 opacity-80">›</span>
    </Link>
  )
  if (!app?.job) return fallback
  const job = app.job
  const [{ data: attRows }, { data: docRows }] = await Promise.all([
    db().from('attendance').select('*').eq('user_id', userId).eq('job_id', job.id),
    db().from('signed_docs').select('id, job_id, status, created_at').eq('user_id', userId).eq('job_id', job.id).eq('status', 'pending'),
  ])
  const atts = ((attRows ?? []) as Attendance[]).filter((a) => a.job_id === job.id)
  const pending = ((docRows ?? []) as { id: string; job_id: string; status: string }[]).filter((d) => d.job_id === job.id && d.status === 'pending')
  const todayAtt = atts.find((a) => a.work_date === today) ?? null
  const open = atts.find((a) => a.clock_in && !a.clock_out) ?? null
  // 전날 근무 종료를 안 누른 채 남아 있으면: 내 근무에서 끝난 시각을 넣게 (여기서는 그쪽으로)
  const stale = open && open.work_date < today
  const shift = open ? shiftOf(job, open) : null

  return (
    <div className="w-[min(78vw,22rem)] space-y-2.5 rounded-2xl bg-white p-3 ring-1 ring-line" data-chat-clock>
      <p className="truncate text-xs font-semibold text-sub">
        {job.title} · {scheduleText(job)}
      </p>
      {stale ? (
        fallback
      ) : open ? (
        <ClockPanel
          jobId={job.id}
          open={{ id: open.id, clock_in: open.clock_in, startText: kstTime(open.clock_in) }}
          endAt={scheduledEnd(shift!, open.work_date).toISOString()}
          endText={hhmm(shift!.end_time)}
          useLocation={job.lat != null}
          gpsRequired={job.gps_required}
          serverNow={Date.now()}
        />
      ) : todayAtt?.clock_out ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center text-sm font-bold text-emerald-700" data-chat-clock-done>
          오늘 근무를 마쳤어요 · 수고했어요
        </p>
      ) : pending.length > 0 ? (
        // 서명이 먼저 (근무 시작이 잠겨 있음)
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-800">서류 {pending.length}건에 서명하면 근무를 시작할 수 있어요</p>
          <Link href={`/docs/${pending[0].id}`} data-chat-button="sign" className="flex items-center gap-2 rounded-2xl bg-brand-600 py-2.5 pr-3.5 pl-3 text-[15px] font-bold text-white transition active:scale-95">
            <Icon name="pen" className="shrink-0 text-lg" />
            <span className="min-w-0 truncate">서류 서명하러 가기</span>
            <span aria-hidden className="shrink-0 opacity-80">›</span>
          </Link>
        </div>
      ) : (
        <ClockPanel jobId={job.id} open={null} useLocation={job.lat != null} gpsRequired={job.gps_required} />
      )}
    </div>
  )
}
