import Link from 'next/link'
import { scheduleText } from '@/lib/docs'
import { won } from '@/lib/format'
import { fmtDateRange } from '@/lib/time'
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
  return (
    <Link href={`/jobs/${job.id}`} className="card block transition hover:ring-2 hover:ring-brand-100">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {myStatus && APP_STATUS[myStatus] && (
          <span className={`badge ${APP_STATUS[myStatus].cls}`}>{APP_STATUS[myStatus].label}</span>
        )}
        {job.status !== 'open' ? (
          <span className="badge bg-gray-100 text-mute">마감</span>
        ) : full ? (
          <span className="badge bg-gray-100 text-sub">정원 마감 · 대기 접수</span>
        ) : (
          <span className="badge bg-brand-50 text-brand-700">모집중</span>
        )}
        {job.event_name && <span className="text-xs font-semibold text-mute">{job.event_name}</span>}
      </div>
      <h3 className="text-[17px] leading-snug font-bold">{job.title}</h3>
      <dl className="mt-3 space-y-1 text-sm text-sub">
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-mute">일정</dt>
          <dd>
            {fmtDateRange(job.start_date, job.end_date)} {scheduleText(job)}
          </dd>
        </div>
        {job.location_name && (
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-mute">장소</dt>
            <dd>{job.location_name}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-mute">급여</dt>
          <dd className="font-bold text-ink">
            {wageBadge(job)}
            {job.allowance > 0 && (
              <span className="ml-1 font-medium text-sub">
                + {job.allowance_label || '수당'} {won(job.allowance)}
              </span>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-mute">인원</dt>
          <dd>
            {approved}/{job.headcount}명 확정
          </dd>
        </div>
      </dl>
    </Link>
  )
}
