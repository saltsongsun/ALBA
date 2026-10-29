export function normalizePhone(input: string): string | null {
  const d = input.replace(/\D/g, '')
  return /^01[016789]\d{7,8}$/.test(d) ? d : null
}

export type ParsedRrn = {
  digits: string
  birthDate: string
  gender: 'M' | 'F'
  isForeigner: boolean
  masked: string
}

/**
 * 주민등록번호(외국인등록번호) 형식 확인.
 * 2020년 10월 이후 발급분은 검증번호 규칙이 없어져 생년월일·성별 자리만 확인합니다.
 */
export function parseRrn(input: string): ParsedRrn | null {
  const d = input.replace(/\D/g, '')
  if (d.length !== 13) return null
  const g = Number(d[6])
  const century = [1, 2, 5, 6].includes(g) ? 1900 : [3, 4, 7, 8].includes(g) ? 2000 : 0
  if (!century) return null
  const y = century + Number(d.slice(0, 2))
  const m = Number(d.slice(2, 4))
  const day = Number(d.slice(4, 6))
  const date = new Date(Date.UTC(y, m - 1, day))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== day) return null
  return {
    digits: d,
    birthDate: `${y}-${d.slice(2, 4)}-${d.slice(4, 6)}`,
    gender: g % 2 === 1 ? 'M' : 'F',
    isForeigner: g >= 5,
    masked: `${d.slice(0, 6)}-${d[6]}******`,
  }
}

export function formatRrn(digits: string): string {
  return digits.length === 13 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : digits
}

export function isPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

export function str(form: FormData, key: string, max = 500): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export function optStr(form: FormData, key: string, max = 500): string | null {
  return str(form, key, max) || null
}

export function int(form: FormData, key: string, fallback = 0): number {
  const raw = str(form, key).replace(/,/g, '')
  const n = Number(raw)
  return raw !== '' && Number.isFinite(n) ? Math.round(n) : fallback
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key)
  return v === 'on' || v === 'true' || v === '1'
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export function isDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T00:00:00Z').getTime())
}

export function isTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v)
}

/** 외부 주소로 튀지 않는 내부 경로만 허용 */
export function safePath(p: unknown, fallback: string): string {
  return typeof p === 'string' && /^\/(?![/\\])/.test(p) ? p : fallback
}
