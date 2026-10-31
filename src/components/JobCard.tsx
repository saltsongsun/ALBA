import Link from 'next/link'
import { scheduleText } from '@/lib/docs'
import { won } from '@/lib/format'
import { shows } from '@/lib/jobFields'
import { fmtDateRange, kstDate } from '@/lib/time'
import type { Job } from '@/lib/types'

export function wageBadge(job: Job): string {
  return job.pay_type === 'daily' ? `일급 ${won(job.daily_wage)}` : `시급 ${won(job.hourly_wage)}`
}

export const APP_STATUS: Record<string, { label: string; cls: string }> = {
  applied: { label: '지원완료', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: '확정', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '미선발', cls: 'bg-gray-100 text-mute' },
  cancelled: { label: '취소', cls: 'bg-gray-100 text-mute' },
}

/** 시작까지 남은 날: 오늘·내일·D-n, 이미 시작했으면 진행 중 (한 달 넘게 남았으면 표시 안 함) */
function dday(job: Job, today: string): string | null {
  if (job.start_date === today) return '오늘'
  if (job.start_date < today && job.end_date >= today) return '진행 중'
  const n = Math.round((Date.parse(job.start_date) - Date.parse(today)) / 86_400_000)
  if (n === 1) return '내일'
  return n > 1 && n <= 30 ? `D-${n}` : null
}

export default function JobCard({
  job,
  approved,
  myStatus,
}: {
  job: Job
  approved: number
  myStatus?: string
}) {
  const full = approved >= job.headcount
  const when = dday(job, kstDate())
  const filled = Math.min(100, Math.round((approved / Math.max(job.headcount, 1)) * 100))
  const showCount = shows(job, 'headcount')
  return (
    <Link href={`/jobs/${job.id}`} className="card-link block">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {when && <span className="badge bg-ink text-white">{when}</span>}
        {myStatus && APP_STATUS[myStatus] && (
          <span className={`badge ${APP_STATUS[myStatus].cls}`}>{APP_STATUS[myStatus].label}</span>
        )}
        {job.status === 'cancelled' ? (
          <span className="badge bg-rose-50 text-rose-600">행사 취소</span>
        ) : job.status !== 'open' ? (
          <span className="badge bg-gray-100 text-mute">마감</span>
        ) : full ? (
          <span className="badge bg-gray-100 text-sub">정원 마감 · 대기 접수</span>
        ) : (
          <span className="badge bg-brand-50 text-brand-700">모집중</span>
        )}
        {job.event_name && <span className="text-xs font-semibold text-mute">{job.event_name}</span>}
      </div>
      <h3 className="text-[17px] leading-snug font-bold">{job.title}</h3>
      <p className="mt-1 text-sm text-sub">
        {fmtDateRange(job.start_date, job.end_date)} {scheduleText(job)}
        {job.location_name && <span className="text-mute"> · {job.location_name}</span>}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-lg font-extrabold tracking-tight">
          {wageBadge(job)}
          {job.allowance > 0 && (
            <span className="ml-1.5 text-xs font-semibold text-sub">
              + {job.allowance_label || '수당'} {won(job.allowance)}
            </span>
          )}
        </p>
        {showCount && (
          <span className="mb-0.5 shrink-0 text-xs font-semibold text-mute tabular-nums">
            {approved}/{job.headcount}명 확정
          </span>
        )}
      </div>
      {/* 모집 인원이 얼마나 찼는지 (처음 보일 때 왼쪽에서 차오름) */}
      {showCount && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
          <div className={`h-full origin-left animate-grow rounded-full ${full ? 'bg-mute' : 'bg-brand-500'}`} style={{ width: `${filled}%` }} />
        </div>
      )}
    </Link>
  )
}
