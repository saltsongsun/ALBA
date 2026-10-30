// 공고 화면에 보이는 기본 항목 중 공고마다 켜고 끌 수 있는 것 (jobs.hidden_fields에 숨긴 것의 key를 저장)
// 근로계약서 등 서류에는 영향 없음

export const JOB_FIELDS = [
  { key: 'estimate', label: '예상 일급', hint: '하루 약 ○○원 (세전)' },
  { key: 'headcount', label: '인원', hint: '모집 인원 · 확정 인원' },
  { key: 'break', label: '휴게', hint: '법정 휴게 안내 (4시간 이상 30분, 8시간 이상 1시간)' },
  { key: 'premium', label: '가산', hint: '연장·야간 50% 가산 (가산을 켠 공고만)' },
  { key: 'tax', label: '공제', hint: '세금·고용보험 공제 방식' },
  { key: 'pay_day', label: '지급일', hint: '임금 지급일 (적은 경우)' },
  { key: 'docs', label: '서류', hint: '확정 후 서명할 서류 목록' },
] as const

export type JobFieldKey = (typeof JOB_FIELDS)[number]['key']

const KEYS: readonly string[] = JOB_FIELDS.map((f) => f.key)

/** 공고 화면에 이 항목을 보여 주는지 */
export function shows(job: { hidden_fields?: string[] | null }, key: JobFieldKey): boolean {
  return !(job.hidden_fields ?? []).includes(key)
}

/** 폼에서 체크된 항목(show_fields)을 뺀 나머지를 숨김 목록으로 */
export function hiddenFromForm(form: FormData): string[] {
  const shown = new Set(form.getAll('show_fields').map(String))
  return KEYS.filter((k) => !shown.has(k))
}
