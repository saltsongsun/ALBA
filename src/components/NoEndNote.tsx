import Link from 'next/link'
import { db } from '@/lib/db'
import { isNoEndAsk } from '@/lib/signals'
import { fmtDate, kstDate } from '@/lib/time'
import Icon from './Icon'

/**
 * 명세서·근무확인서 위 한 줄 (인쇄에는 안 나옴 · 정기 개선 2026-11-22 23:35)
 * 지난 근무 중 '근무 종료' 기록이 없는 날은 계산에서 빠져 있음 → 모르고 0원·빈 서류를 내지 않게 알리고 바로 고칠 곳으로:
 *  - 근무자 본인: 그 공고 회사 담당자에게 알리기 (문의함에 날짜가 적힌 글을 준비 · 이미 알렸으면 '✓ 알렸어요')
 *  - 관리자: 출퇴근 탭의 그 날 · 그 사람으로 바로 (종료 넣기)
 * 오늘 근무 중인 날은 빼고 (끝나면 들어감)
 */
export default async function NoEndNote({
  rows,
  jobId,
  userId,
  self,
}: {
  rows: readonly { work_date: string; pay: { incomplete: boolean } }[]
  jobId: string
  userId: string
  self: boolean
}) {
  const today = kstDate()
  const days = [...new Set(rows.filter((r) => r.pay.incomplete && r.work_date < today).map((r) => r.work_date))].sort()
  if (!days.length) return null
  const label = days.length === 1 ? fmtDate(days[0]) : `${fmtDate(days[0])} 외 ${days.length - 1}일`
  // 근무자: 마지막 빠진 날 이후에 이미 알렸으면 다시 묻지 않게 (내 대화 · 이 공고 글만)
  const asked = self
    ? await db()
        .from('messages')
        .select('body, created_at, job_id, from_admin')
        .eq('thread_user_id', userId)
        .eq('job_id', jobId)
        .eq('from_admin', false)
        .order('created_at', { ascending: false })
        .limit(30)
        .then(
          (r) => ((r.data ?? []) as { body: string; created_at: string; job_id: string | null; from_admin: boolean }[]).some((m) => !m.from_admin && m.job_id === jobId && isNoEndAsk(m.body) && kstDate(m.created_at) >= days.at(-1)!),
          () => false,
        )
    : false
  const act = 'shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold whitespace-nowrap ring-1 transition active:scale-95'
  return (
    <div className="no-print animate-pop space-y-1 rounded-xl bg-amber-50 px-3.5 py-2.5 ring-1 ring-amber-200" data-noend={days.length}>
      <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
        <Icon name="clock" className="shrink-0 text-amber-600" />
        <span className="truncate">종료 기록 없음 · {label}</span>
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-amber-800">이 날은 아직 계산에 빠져 있어요</p>
        {self ? (
          asked ? (
            <Link href={`/me/chat?job=${jobId}`} className={`${act} text-emerald-700 ring-emerald-200`} data-noend-asked>
              ✓ 알렸어요
            </Link>
          ) : (
            <Link href={`/me/chat?job=${jobId}&ask=noend&d=${days.slice(0, 5).join(',')}`} className={`${act} text-amber-800 ring-amber-200`} data-noend-ask>
              담당자에게 알리기 →
            </Link>
          )
        ) : (
          <Link href={`/admin/jobs/${jobId}?tab=att&date=${days[0]}&fix=${userId}#att-${userId}`} className={`${act} text-amber-800 ring-amber-200`} data-noend-fix>
            종료 넣기 →
          </Link>
        )}
      </div>
    </div>
  )
}
