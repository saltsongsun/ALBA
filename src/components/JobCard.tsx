import SlotBar from '@/components/SlotBar'
import Link from 'next/link'
import { NewBadge } from './NewJobs'
import { scheduleText } from '@/lib/docs'
import { won } from '@/lib/format'
import { headcountTbd, shows } from '@/lib/jobFields'
import { estimateDay, workOver } from '@/lib/pay'
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
  clash = false,
  showNew = false,
  rating,
  pals = 0,
  track,
  hideCompany = false,
}: {
  /** company: 공고를 낸 회사 (여러 회사가 함께 쓰므로 카드에 표시) */
  job: Job & { company?: { company_name: string; verified?: boolean | null } | null }
  approved: number
  myStatus?: string
  /** 확정·지원한 내 일정과 같은 날 같은 시간대 */
  clash?: boolean
  /** 지난번에 본 뒤로 새로 올라온 공고면 '🆕 새 공고' (홈 공고 목록) */
  showNew?: boolean
  /** 근무자 후기 평균 별점 (가입한 회원에게만) */
  rating?: { avg: number; count: number } | null
  /** 이 공고에 지원·확정된 내 동료 수 */
  pals?: number
  /** 행동 기록에 남길 이름 (어느 화면의 공고 카드를 눌렀는지) */
  track?: string
  /** 한 회사 공고만 모은 화면: 회사 이름 줄을 카드마다 되풀이하지 않음 */
  hideCompany?: boolean
}) {
  const full = approved >= job.headcount
  const when = dday(job, kstDate())
  // 오늘이 마지막 날이고 근무 시간까지 끝났으면 '오늘 근무 종료' (지원 버튼이 없는 공고)
  const over = job.status === 'open' && job.end_date === kstDate() && workOver(job, job.end_date)
  // 인원 미정 공고: 남은 자리·칸 대신 '인원 미정' 한마디
  const tbd = headcountTbd(job)
  const showCount = shows(job, 'headcount') && !tbd
  const dayEst = job.pay_type !== 'daily' && job.hourly_wage > 0 && shows(job, 'estimate') ? estimateDay(job).gross : null
  return (
    <Link href={`/jobs/${job.id}`} className="card-link block" transitionTypes={['nav-forward']} data-track={track}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {job.audience === 'expert' && <span className="badge bg-violet-50 text-violet-700">🎛️ 전문가 의뢰</span>}
        {when && <span className="badge bg-ink text-white">{when}</span>}
        {myStatus && APP_STATUS[myStatus] && (
          <span className={`badge ${APP_STATUS[myStatus].cls}`}>{APP_STATUS[myStatus].label}</span>
        )}
        {job.status === 'cancelled' ? (
          <span className="badge bg-rose-50 text-rose-600">행사 취소</span>
        ) : job.status !== 'open' ? (
          <span className="badge bg-gray-100 text-mute">마감</span>
        ) : over ? (
          <span className="badge bg-gray-100 text-mute" data-over-today>
            오늘 {job.audience === 'expert' ? '일정' : '근무'} 종료
          </span>
        ) : full ? (
          <span className="badge bg-gray-100 text-sub">정원 마감 · 대기 접수</span>
        ) : (
          <span className="badge bg-brand-50 text-brand-700">모집중</span>
        )}
        {showNew && job.status === 'open' && <NewBadge createdAt={job.created_at} />}
        {clash && (
          <span className="badge animate-pop bg-amber-50 text-amber-800 ring-1 ring-amber-200" data-clash>
            ⚠️ 내 일정과 겹쳐요
          </span>
        )}
        {job.event_name && <span className="text-xs font-semibold text-mute">{job.event_name}</span>}
      </div>
      <h3 className="text-[17px] leading-snug font-bold">{job.title}</h3>
      {pals > 0 && (
        <p className="mt-1 inline-flex animate-pop items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700" data-card-pals>
          🤝 동료 {pals}명 지원
        </p>
      )}
      {!hideCompany && job.company?.company_name && (
        <p className="mt-0.5 truncate text-xs font-semibold text-mute">
          🏢 {job.company.company_name}
          {/* 해피워크가 확인한 회사 (사업자 확인) */}
          {job.company.verified === true && <span className="ml-1 text-emerald-600">✓ 확인된 회사</span>}
          {rating && (
            <span className="ml-1 text-amber-600" data-card-rating aria-label={`근무자 후기 별점 ${rating.avg}점, ${rating.count}개`}>
              ★{rating.avg.toFixed(1)}
              <span className="font-normal text-mute">({rating.count})</span>
            </span>
          )}
        </p>
      )}
      <p className="mt-1 text-sm text-sub">
        {fmtDateRange(job.start_date, job.end_date)} {scheduleText(job)}
        {job.location_name && <span className="text-mute"> · {job.location_name}</span>}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-extrabold tracking-tight">
            {wageBadge(job)}
            {job.allowance > 0 && (
              <span className="ml-1.5 text-xs font-semibold text-sub">
                + {job.allowance_label || '수당'} {won(job.allowance)}
              </span>
            )}
          </p>
          {/* 시급 공고: 하루에 얼마인지 카드에서 바로 (공고 화면의 '하루 약 ○○원'과 같은 계산 · 일급은 이미 하루 금액) */}
          {dayEst != null && (
            <p className="text-xs text-sub tabular-nums" data-card-day>
              하루 약 <b className="font-semibold text-ink">{won(dayEst)}</b>
            </p>
          )}
        </div>
        {showCount &&
          (job.status === 'open' && !full && !over ? (
            // 남은 자리: 2자리 이하면 마감 임박으로 눈에 띄게 (오늘 끝난 근무는 'n/n명 확정'으로)
            job.headcount - approved <= 2 ? (
              <span className="mb-0.5 shrink-0 animate-pop rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600 tabular-nums">
                마감 임박 · {job.headcount - approved}자리
              </span>
            ) : (
              <span className="mb-0.5 shrink-0 text-xs font-semibold text-brand-700 tabular-nums">{job.headcount - approved}자리 남음</span>
            )
          ) : (
            <span className="mb-0.5 shrink-0 text-xs font-semibold text-mute tabular-nums">
              {approved}/{job.headcount}명 확정
            </span>
          ))}
        {tbd && shows(job, 'headcount') && job.status === 'open' && !full && !over && (
          <span className="mb-0.5 shrink-0 text-xs font-semibold text-sub" data-card-tbd>
            인원 미정
          </span>
        )}
      </div>
      {/* 모집 인원이 얼마나 찼는지: 모집 인원만큼 칸을 나눠 (처음 보일 때 왼쪽 칸부터 차오름) */}
      {showCount && (
        <SlotBar value={approved} max={job.headcount} color={full ? 'bg-mute' : 'bg-brand-500'} height="h-1.5" className="mt-2" overflow={false} />
      )}
    </Link>
  )
}
