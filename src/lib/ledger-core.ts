/**
 * 거래장부(구글 시트 '03_결제대금') 연동의 계산만 (다른 파일을 부르지 않는 순수 함수 · 테스트에서 바로 부름)
 * 원칙: 시트의 기존 줄은 절대 바꾸지 않음 — 맨 아래에 새 줄만 추가하고 비고에 '🤖 해피워크 자동' 표시
 */

/** 장부 탭 이름 (시트에 있는 그대로) */
export const TAB = { workers: '02)일용직정보', projects: '03)프로젝트정보', ledger: '05)일용직거래장부' } as const
/** 데이터가 시작하는 줄 (그 위는 제목·작성매뉴얼·머리글) */
export const FIRST_ROW = 6
/** 자동으로 넣은 줄 표시 (비고 칸 앞머리) */
export const AUTO_MARK = '🤖 해피워크 자동'

/** 고유코드 '홍길동(900101)' → 이름·생년월일 6자리 (이름 사이 띄어쓰기는 무시) */
export function parseCode(code: string): { name: string; b6: string } | null {
  const m = code.trim().match(/^(.+?)\s*\((\d{6})?\)$/)
  return m ? { name: m[1].replace(/\s+/g, ''), b6: m[2] ?? '' } : null
}
export const codeOf = (name: string, b6: string) => `${name.trim()}(${b6})`
export const sameName = (a: string, b: string) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '')

/** 날짜 칸 글자 → YYYY-MM-DD ('2026-11-06' · '2026. 11. 6' · '2026/11/06') · 못 읽으면 null */
export function isoDate(s: string): string | null {
  const m = (s ?? '').trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}
/** '₩1,234' · '1234' → 1234 */
export const money = (s: string) => Number((s ?? '').replace(/[^\d.-]/g, '')) || 0

export type LedgerRow = {
  /** 시트의 줄 번호 */
  row: number
  projectDate: string | null
  dueDate: string | null
  paidDate: string | null
  project: string
  code: string
  name: string
  b6: string
  amount: number
  tax: string
  confirmed: boolean
  note: string
}

/** '05)일용직거래장부' A~O 값 → 줄 목록 (빈 줄·고유코드 없는 줄은 뺌) */
export function parseLedger(values: string[][], firstRow = FIRST_ROW): LedgerRow[] {
  const out: LedgerRow[] = []
  values.forEach((r, i) => {
    const code = (r[5] ?? '').trim()
    const p = parseCode(code)
    if (!p) return
    out.push({
      row: firstRow + i,
      projectDate: isoDate(r[0] ?? ''),
      dueDate: isoDate(r[1] ?? ''),
      paidDate: isoDate(r[2] ?? ''),
      project: (r[4] ?? '').trim(),
      code,
      name: p.name,
      b6: p.b6,
      amount: money(r[10] ?? ''),
      tax: (r[11] ?? '').trim(),
      confirmed: (r[13] ?? '').trim().toUpperCase() === 'TRUE',
      note: (r[14] ?? '').trim(),
    })
  })
  return out
}

/** 해피워크 공고의 공제 종류 → 장부 원천세 목록의 말 (목록에 없는 종류는 '' → 비고에 확인 필요 표시) */
export function taxLabel(taxType: string, insurance: boolean): string {
  if (taxType === 'business') return insurance ? '사업소득+고용보험' : '사업소득(3.3%)'
  if (taxType === 'other') return insurance ? '기타소득+고용보험' : '기타소득(8.8%)'
  return ''
}

/**
 * 윗줄 수식을 새 줄 번호로 옮김 ('=IF($F1849="",…' → '=IF($F1850="",…')
 * 열 글자 바로 뒤에 붙은 그 줄 번호만 바꿈 (125000 같은 숫자 · $F:$F 같은 열 전체 참조는 그대로)
 */
export function shiftFormula(formula: string, from: number, to: number): string {
  if (!formula.startsWith('=')) return formula
  return formula.replace(new RegExp(`(\\$?[A-Z]{1,3})\\$?${from}(?![0-9])`, 'g'), (_m, col: string) => `${col}${to}`)
}

/** 마지막 데이터 줄 번호 (열 하나의 값 목록 · 첫 줄은 firstRow) — 없으면 firstRow - 1 */
export function lastRow(col: string[][], firstRow = FIRST_ROW): number {
  let last = -1
  col.forEach((r, i) => {
    if ((r[0] ?? '').trim()) last = i
  })
  return last < 0 ? firstRow - 1 : firstRow + last
}

/** 자동으로 넣는 줄의 비고 ('🤖 해피워크 자동 (11/21) · 공고 제목 · ⚠ 원천세 확인 필요') */
export function autoNote(today: string, parts: (string | false | null | undefined)[]): string {
  const md = `${Number(today.slice(5, 7))}/${Number(today.slice(8, 10))}`
  return [`${AUTO_MARK} (${md})`, ...parts.filter(Boolean)].join(' · ')
}

/**
 * 장부(05) 새 줄 A~O — 사람이 적는 칸(프로젝트일·프로젝트·고유코드·도급금액·원천세)만 채우고,
 * 수식 칸(입금예정일·은행·계좌·예금주·주민번호·지급금액)은 윗줄 수식을 새 줄 번호로 옮겨 씀 · 입금확인은 체크 안 함
 */
export function ledgerRow(
  tpl: string[],
  tplRow: number,
  row: number,
  v: { projectDate: string; project: string; code: string; amount: number; tax: string; note: string },
): (string | number | boolean)[] {
  const f = (i: number) => shiftFormula(tpl[i] ?? '', tplRow, row)
  const keep = (i: number) => ((tpl[i] ?? '').startsWith('=') ? f(i) : '')
  return [v.projectDate, keep(1), '', keep(3), v.project, v.code, keep(6), keep(7), keep(8), keep(9), v.amount, v.tax, keep(12), false, v.note]
}

/** 생년월일 6자리: 회원 생년월일(YYYY-MM-DD) 우선, 없으면 주민번호 앞 6자리 */
export function b6Of(birthDate: string | null | undefined, rrnDigits?: string | null): string {
  const m = (birthDate ?? '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}${m[2]}${m[3]}`
  const d = (rrnDigits ?? '').replace(/\D/g, '')
  return d.length >= 6 ? d.slice(0, 6) : ''
}

/** 프로젝트 이름 비교 (띄어쓰기·대소문자 무시) */
export const sameProject = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase()

/** 기록 글('… · job=… · user=…')의 key=value 조각 */
export function detailTokens(detail: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (detail ?? '').split(' · ')) {
    const m = part.trim().match(/^([a-z]+)=(.+)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/** 0 → 'A', 14 → 'O' */
export const colLetter = (i: number) => String.fromCharCode(65 + i)

/**
 * 마지막 데이터 줄 (여러 열 중 사람이 적는 열만 봄 · 값 목록은 firstRow부터) — 없으면 firstRow - 1
 * cols: 열마다 시트에서 받은 값 목록 · pick: 줄 하나에서 볼 칸 번호들
 */
export function lastDataRow(values: string[][], pick: number[], firstRow = FIRST_ROW): number {
  let last = -1
  values.forEach((r, i) => {
    if (pick.some((c) => (r[c] ?? '').trim())) last = i
  })
  return last < 0 ? firstRow - 1 : firstRow + last
}

/**
 * 새로 쓸 줄이 정말 비었는지 (수식 그대로 받은 값) — 사람이 적는 칸에 뭐라도 있으면 그 줄 번호를 돌려줌(쓰지 않음)
 * 미리 깔린 수식(formulaCols)·체크 안 한 체크칸(boolCols의 FALSE)은 빈 것으로 봄
 */
export function busyRow(values: string[][], firstRow: number, formulaCols: number[], boolCols: number[] = []): number | null {
  for (let i = 0; i < values.length; i++) {
    const r = values[i] ?? []
    for (let c = 0; c < r.length; c++) {
      const v = (r[c] ?? '').trim()
      if (!v) continue
      if (formulaCols.includes(c) && v.startsWith('=')) continue
      if (boolCols.includes(c) && v.toUpperCase() === 'FALSE') continue
      return firstRow + i
    }
  }
  return null
}

/** 새 줄 값에 미리 깔린 수식이 있으면 그 수식을 그대로 둠 (기존 내용을 바꾸지 않게) */
export function keepPrefilled(row: (string | number | boolean)[], existing: string[] | undefined): (string | number | boolean)[] {
  return row.map((v, c) => {
    const e = (existing?.[c] ?? '').trim()
    return e.startsWith('=') ? e : v
  })
}
