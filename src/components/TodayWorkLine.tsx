// ✏️ 새 파일 (정기 개선 2026-11-26 17:35)
// '이 회사 오늘 근무' 한 줄 (관리자 문의 대화 머리 · 근무자 상세) — 점 · 굵은 상태 · 짧은 덧말 · 공고 제목, 누르면 그 공고 출퇴근 탭
// 근무 중·미출근은 점이 살짝 깜빡임 (움직임 줄이기면 점만) · 줄은 처음 한 번 살짝 떠오름
import Link from 'next/link'
import type { WorkLine } from '@/lib/todayWork'

export default function TodayWorkLine({ line, className = '', ...rest }: { line: WorkLine; className?: string } & Record<`data-${string}`, string | boolean>) {
  return (
    <Link
      href={line.href}
      className={`flex min-w-0 items-center gap-1.5 text-xs text-sub transition-opacity active:opacity-60 ${className}`}
      data-work-state={line.state}
      {...rest}
    >
      {/* 점 색은 바깥 칸에 (깜빡이는 고리는 그 위에 겹침) */}
      <span aria-hidden className={`relative size-2 shrink-0 rounded-full ${line.dot}`}>
        {line.live && <span className={`absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden ${line.dot}`} />}
      </span>
      <span className="truncate">
        <b className="font-semibold text-ink">{line.text}</b>
        {line.told && <b className={`font-semibold ${line.told.tone}`} data-work-told> · {line.told.text}</b>} · {line.title}
      </span>
    </Link>
  )
}
