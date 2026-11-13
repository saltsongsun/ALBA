import type { XpState } from '@/lib/xp'

/**
 * 관리자 화면의 병아리 레벨 배지 'Lv.n' (명단 · 대시보드 대기 카드 · 지원자 탭 · 이전 근무자에게 모집 알리기) — 이 회사 기록으로 센 레벨 (lib/xpCompany).
 * Lv.3부터는 조금 진하게 (믿음직한 사람이 바로 눈에 띄게) · 길게 누르면 단계 이름과 기준
 */
export default function LevelBadge({ x }: { x: (Pick<XpState, 'level'> & { stage: Pick<XpState['stage'], 'name'> }) | null | undefined }) {
  if (!x) return null
  return (
    <span
      className={`badge tabular-nums ${x.level >= 3 ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700'}`}
      title={`${x.stage.name} · 우리 회사 기록으로 센 레벨`}
      aria-label={`레벨 ${x.level} ${x.stage.name}`}
      data-level={x.level}
    >
      Lv.{x.level}
    </span>
  )
}
