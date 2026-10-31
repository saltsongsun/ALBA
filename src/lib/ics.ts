// 휴대폰 달력에 넣는 일정 파일(.ics, RFC 5545). 한국 시간은 서머타임이 없어 UTC로 바꿔 적음
import { kstAt } from './time'
import { APP_NAME } from './brand'

export type IcsEvent = {
  uid: string
  date: string // YYYY-MM-DD
  start: string // HH:MM(:SS)
  end: string // 시작보다 이르면 다음날
  title: string
  location?: string | null
  description?: string | null
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** 한 줄이 75바이트를 넘으면 접기 (한글이 잘리지 않게 글자 단위로) */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = Buffer.byteLength(ch)
    if (bytes + b > 73) {
      out.push(cur)
      cur = ' '
      bytes = 1
    }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.join('\r\n')
}

export function buildIcs(events: IcsEvent[], calName = APP_NAME): string {
  const stamp = utc(new Date())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//socket-alba//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(calName)}`]
  for (const e of events) {
    const start = kstAt(e.date, e.start)
    let end = kstAt(e.date, e.end)
    if (end <= start) end = new Date(end.getTime() + 86_400_000)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(start)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      // 시작 1시간 30분 전에 알림
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(e.title)}`,
      'TRIGGER:-PT90M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
