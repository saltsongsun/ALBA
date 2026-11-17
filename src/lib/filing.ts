/**
 * 지난달 근무에 대한 이번 달 신고 마감 (관리자 홈 'n월분 신고' 체크 칸).
 * 신고 화면(정산·신고자료)에 적힌 기한과 같게: 원천세 10일 · 근로내용확인신고 15일 · 일용근로소득 지급명세 말일.
 * 주말·공휴일로 미뤄지는 날은 따지지 않고 날짜만 (잊지 않게 미리 알리는 용도). 다른 파일을 부르지 않는 순수 함수 (시험에서 바로 부름)
 */
export type FilingDue = { key: 'tax' | 'employment' | 'daily'; label: string; where: string; due: string; left: number }

/** today: 'YYYY-MM-DD' (한국 날짜) → 지난달 'YYYY-MM' */
export function prevMonthOf(today: string): string {
  const [y, m] = today.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** 아직 지나지 않은 이번 달 신고 마감 (가까운 순) */
export function filingDues(today: string): FilingDue[] {
  const [y, m, d] = today.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const ym = today.slice(0, 7)
  const rows: { key: FilingDue['key']; label: string; where: string; day: number }[] = [
    { key: 'tax', label: '원천세 신고·납부', where: '홈택스', day: 10 },
    { key: 'employment', label: '근로내용확인신고', where: '고용·산재', day: 15 },
    { key: 'daily', label: '일용근로소득 지급명세', where: '홈택스', day: last },
  ]
  return rows.filter((r) => r.day >= d).map((r) => ({ key: r.key, label: r.label, where: r.where, due: `${ym}-${String(r.day).padStart(2, '0')}`, left: r.day - d }))
}
