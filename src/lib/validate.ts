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

/**
 * 추측하기 쉬운 6자리 비밀번호인지 (자동 대입 공격이 가장 먼저 시도하는 번호들).
 * 같은 숫자 반복·연속 숫자·두세 자리 반복·자주 쓰는 번호·생년월일·휴대폰 번호 일부를 막음
 */
export function weakPin(pin: string, ctx: { birthDate?: string | null; phone?: string | null } = {}): string | null {
  const d = pin.split('').map(Number)
  if (/^(\d)\1{5}$/.test(pin)) return '같은 숫자만 반복한 비밀번호는 쓸 수 없어요.'
  const steps = d.slice(1).map((n, i) => (n - d[i] + 10) % 10)
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return '연속된 숫자(123456 등)는 쓸 수 없어요.'
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d\d\d)\1$/.test(pin)) return '같은 숫자 묶음을 반복한 비밀번호는 쓸 수 없어요.'
  if (['112233', '121212', '123123', '102030', '147258', '159753', '520520', '000001', '100000'].includes(pin)) {
    return '너무 흔한 비밀번호예요. 다른 번호로 정해 주세요.'
  }
  if (ctx.birthDate) {
    const [y, m, dd] = ctx.birthDate.split('-')
    const yy = y.slice(2)
    if ([yy + m + dd, m + dd + yy, dd + m + yy, y + m, m + dd + y.slice(0, 2)].includes(pin)) return '생년월일로 된 비밀번호는 쓸 수 없어요.'
  }
  if (ctx.phone && ctx.phone.replace(/\D/g, '').slice(3).includes(pin)) return '휴대폰 번호가 들어간 비밀번호는 쓸 수 없어요.'
  return null
}
