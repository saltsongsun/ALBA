// 공고 화면에 보이는 기본 항목 중 공고마다 켜고 끌 수 있는 것 (jobs.hidden_fields에 숨긴 것의 key를 저장)
// 근로계약서 등 서류에는 영향 없음

export const JOB_FIELDS = [
  { key: 'estimate', label: '예상 일급', hint: '하루 약 ○○원 (세전)' },
  { key: 'headcount', label: '인원', hint: '남은 자리 · 확정 인원 (기본은 숨김)' },
  { key: 'break', label: '휴게', hint: '법정 휴게 안내 (4시간 이상 30분, 8시간 이상 1시간)' },
  { key: 'premium', label: '가산', hint: '연장·야간 50% 가산 (가산을 켠 공고만)' },
  { key: 'tax', label: '공제', hint: '세금·고용보험 공제 방식' },
  { key: 'pay_day', label: '지급일', hint: '임금 지급일 (적은 경우)' },
  { key: 'docs', label: '서류', hint: '확정 후 서명할 서류 목록' },
] as const

export type JobFieldKey = (typeof JOB_FIELDS)[number]['key']

const KEYS: readonly string[] = JOB_FIELDS.map((f) => f.key)

/**
 * 인원(남은 자리·확정 인원)은 기본으로 근무자에게 숨김 (사용자 요청 2026-11-17 "채용 중인 인원 안 보이는 게 기본 · 보이기를 켤 수 있게"):
 * 공고에서 켠 경우에만 hidden_fields에 이 표시가 들어감 → 표시가 없는 예전 공고도 모두 숨김 (DB를 바꾸지 않음)
 */
export const HEADCOUNT_SHOWN = 'headcount_shown'

/** 공고 화면에 이 항목을 보여 주는지 */
export function shows(job: { hidden_fields?: string[] | null }, key: JobFieldKey): boolean {
  const hidden = job.hidden_fields ?? []
  if (key === 'headcount') return hidden.includes(HEADCOUNT_SHOWN)
  return !hidden.includes(key)
}

/** 폼에서 체크된 항목(show_fields)을 뺀 나머지를 숨김 목록으로 (인원을 켰으면 켰다는 표시도) */
export function hiddenFromForm(form: FormData): string[] {
  const shown = new Set(form.getAll('show_fields').map(String))
  return [...KEYS.filter((k) => !shown.has(k)), ...(shown.has('headcount') ? [HEADCOUNT_SHOWN] : [])]
}

/**
 * 모집 인원 미정 (사용자 요청 2026-11-12 "10명이 기획이지만 5명만 뽑을 때도 있어 · 안 뽑힌 사람들이 연락이 와"):
 * 공고에는 숫자 대신 '인원 미정' · 입력한 숫자는 최대 인원으로만 씀 (다 차면 마감 등) · 인원이 모자라다는 경고도 하지 않음
 * DB를 바꾸지 않으려고 hidden_fields에 표시로 저장 (공고 화면 표시 설정과 같은 칸)
 */
export const HEADCOUNT_TBD = 'headcount_tbd'
export function headcountTbd(job: { hidden_fields?: string[] | null }): boolean {
  return (job.hidden_fields ?? []).includes(HEADCOUNT_TBD)
}

