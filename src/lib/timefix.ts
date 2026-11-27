/**
 * ✏️ 정기 개선 2026-11-27 07:35 (새 파일)
 * 담당자가 출퇴근 시각을 고칠 때 근무자에게 보내는 한 줄 ('출근 06:00 → 09:00 · 종료 18:00 → 17:30')
 * — 고치기 화면 미리보기(브라우저)와 실제로 보내는 글(서버)이 같은 말을 쓰게 한 곳에서 만듦.
 * 시각은 'HH:MM' (분 단위로만 비교 · 초만 다르면 바뀐 게 아님)
 */
export type TimePair = { in: string; out: string | null }

export function timeFixText(before: TimePair, after: TimePair): string | null {
  const parts: string[] = []
  if (before.in && after.in && before.in !== after.in) parts.push(`출근 ${before.in} → ${after.in}`)
  if (before.out && after.out && before.out !== after.out) parts.push(`종료 ${before.out} → ${after.out}`)
  else if (!before.out && after.out) parts.push(`종료 ${after.out} 넣음`)
  return parts.length ? parts.join(' · ') : null
}
