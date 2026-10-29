// 서버(Vercel)는 UTC로 돌기 때문에 날짜·시각 표시는 모두 한국 시간으로 고정합니다.
const TZ = 'Asia/Seoul'
const HOUR = 3600_000
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

type DateLike = Date | string | number

const toDate = (d: DateLike) => (d instanceof Date ? d : new Date(d))

/** 한국 날짜 'YYYY-MM-DD' */
export function kstDate(d: DateLike = new Date()): string {
  return dateFmt.format(toDate(d))
}

/** 한국 시각 'HH:mm' */
export function kstTime(d: DateLike): string {
  return timeFmt.format(toDate(d))
}

/** 'M/D(요일) HH:mm' */
export function kstDateTime(d: DateLike): string {
  return `${fmtDate(kstDate(d))} ${kstTime(d)}`
}

function weekday(dateStr: string): string {
  return WEEK[new Date(dateStr + 'T00:00:00Z').getUTCDay()]
}

/** 'YYYY-MM-DD' → '10/29(목)' */
export function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}/${d}(${weekday(dateStr)})`
}

/** 'YYYY-MM-DD' → '2026년 10월 29일' */
export function fmtDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

export function fmtDateRange(start: string, end: string): string {
  return start === end ? fmtDate(start) : `${fmtDate(start)} ~ ${fmtDate(end)}`
}

/** 'HH:MM:SS' → 'HH:MM' */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

/** 시작~종료 날짜 목록 */
export function dateList(start: string, end: string): string[] {
  const out: string[] = []
  const cur = new Date(start + 'T00:00:00Z')
  const last = new Date(end + 'T00:00:00Z')
  while (cur <= last && out.length < 400) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

/** ISO → datetime-local 입력값 (한국 시간) */
export function toKstInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return `${kstDate(iso)}T${kstTime(iso)}`
}

/** datetime-local 입력값(한국 시간) → ISO */
export function fromKstInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const d = new Date(value + ':00+09:00')
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 날짜 + 'HH:MM' (한국 시간) → Date */
export function kstAt(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${hhmm(time)}:00+09:00`)
}

export function minutesText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}시간 ${m}분`
  if (h) return `${h}시간`
  return `${m}분`
}

/** 한국 시간 기준 22:00~06:00과 겹치는 분 */
export function nightMinutes(start: Date, end: Date): number {
  const DAY = 24 * HOUR
  const a = start.getTime() + 9 * HOUR
  const b = end.getTime() + 9 * HOUR
  let total = 0
  for (let day = Math.floor(a / DAY) - 1; day * DAY < b; day++) {
    const ws = day * DAY + 22 * HOUR
    const we = day * DAY + 30 * HOUR
    total += Math.max(0, Math.min(b, we) - Math.max(a, ws))
  }
  return Math.floor(total / 60_000)
}

/** 'YYYY-MM' 의 첫날·마지막날 */
export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`]
}

/** 만 나이 */
export function ageOn(birth: string, on: string = kstDate()): number {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [y, m, d] = on.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}
