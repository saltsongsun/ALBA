/** 평균 별점 배지 (관리자 화면 전용) — 평가가 없으면 그리지 않음 */
export function StarAvg({ scores }: { scores: number[] }) {
  if (!scores.length) return null
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return (
    <span className="badge bg-amber-50 text-amber-700" title={`관리자 평가 ${scores.length}건 평균`}>
      ★ {avg.toFixed(1)}
      <span className="ml-0.5 font-medium text-amber-700/60">({scores.length})</span>
    </span>
  )
}

/** 별 다섯 개 중 몇 개 */
export function StarRow({ score }: { score: number }) {
  return (
    <span role="img" aria-label={`5점 만점에 ${score}점`} className="tracking-tighter text-amber-400">
      {'★'.repeat(score)}
      <span className="text-line">{'★'.repeat(5 - score)}</span>
    </span>
  )
}

/** user_id별 점수 목록으로 묶기 */
export function scoresByUser(rows: { user_id: string; score: number }[]): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const r of rows) (out[r.user_id] ??= []).push(r.score)
  return out
}
