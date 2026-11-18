import Link from 'next/link'
import { fmtDate } from '@/lib/time'
import { daysUntil } from '@/lib/worker-payday'

/**
 * 근무 카드의 정산일 한 줄 (내 근무 홈 '근무 내역 · 급여' · '지난 근무'가 같은 모양)
 * - 아직: 주황 '💰 정산 예정 11/25(화)' + 남은 날 'D-5' (그날이면 '오늘')
 * - 지났는데 입금 전: 빨강 '💰 정산일 11/17(화) 지남 · 문의 →' (그 회사 담당자에게 준비된 글로)
 * - 그 뒤 물어봤으면: '… 지남 · ✓ 물어봄 ›' (답 보러 그 회사 문의함)
 * 제목 위를 덮은 공고 링크보다 위에 놓여야 눌림 (relative z-10)
 */
export default function PaydayLine({ jobId, companyId, label, due, asked, today }: { jobId: string; companyId: string | null; label: string | null; due: string | null; asked: boolean; today: string }) {
  if (!label) return null
  if (due && due < today) {
    return asked ? (
      <Link href={`/me/chat?co=${companyId ?? ''}`} className="relative z-10 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-sub transition active:scale-95" data-payday-line="asked">
        <span className="text-rose-600">💰 정산일 {fmtDate(due)} 지남</span> · ✓ 물어봄 ›
      </Link>
    ) : (
      <Link href={`/me/chat?job=${jobId}&ask=paylate`} className="relative z-10 inline-flex items-center gap-1 rounded-md text-xs font-bold text-rose-600 transition active:scale-95" data-payday-line="over">
        💰 정산일 {fmtDate(due)} 지남 · 문의 →
      </Link>
    )
  }
  const left = due ? daysUntil(due, today) : null
  return (
    <p className="text-xs font-semibold text-amber-700" data-payday-line>
      💰 정산 예정 {label}
      {left !== null && (
        <span className={`ml-1.5 inline-block rounded px-1 align-[1px] text-[11px] font-bold tabular-nums ${left === 0 ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'}`} data-payday-left={left}>
          {left === 0 ? '오늘' : `D-${left}`}
        </span>
      )}
    </p>
  )
}
