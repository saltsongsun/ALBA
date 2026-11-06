import { fmtDate } from './time'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate() // m월의 마지막 날
  return `${y}-${pad(m)}-${pad(Math.min(d, last))}`
}

/**
 * 공고의 '지급일' 글자에서 날짜를 짐작 (마지막 근무일 기준). 모르면 null → 글자 그대로 씀.
 * 예: '익월 10일' → 다음 달 10일 · '행사 종료 후 7일 이내' → 마지막 날 + 7일(까지) · '당월 25일' · '11월 20일'
 */
export function paydayGuess(payDay: string | null | undefined, endDate: string): { date: string; until: boolean } | null {
  const t = (payDay ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  const [y, m, d] = endDate.split('-').map(Number)
  let r: RegExpMatchArray | null
  if ((r = t.match(/(?:익월|다음\s?달)\s?(\d{1,2})\s?일/))) return { date: m === 12 ? ymd(y + 1, 1, Number(r[1])) : ymd(y, m + 1, Number(r[1])), until: false }
  if ((r = t.match(/(?:종료|끝난|근무|행사)\s?(?:일\s?)?(?:후|뒤|로부터)\s?(\d{1,2})\s?일/))) {
    const t2 = new Date(Date.UTC(y, m - 1, d + Number(r[1])))
    return { date: ymd(t2.getUTCFullYear(), t2.getUTCMonth() + 1, t2.getUTCDate()), until: /이내|안에|까지/.test(t) }
  }
  if ((r = t.match(/당월\s?(\d{1,2})\s?일/))) return { date: ymd(y, m, Number(r[1])), until: false }
  if ((r = t.match(/(\d{1,2})\s?월\s?(\d{1,2})\s?일/))) {
    const mm = Number(r[1])
    const dd = Number(r[2])
    const date = ymd(y, mm, dd)
    return { date: date < endDate ? ymd(y + 1, mm, dd) : date, until: /까지|이내/.test(t) }
  }
  return null
}

/** 근무자에게 보일 정산 예정일 글자: '12/10(목)' · '11/13(금)까지' · 짐작 못 하면 지급일 글자 그대로 · 없으면 null */
export function paydayLabel(payDay: string | null | undefined, endDate: string): string | null {
  const g = paydayGuess(payDay, endDate)
  if (g) return `${fmtDate(g.date)}${g.until ? '까지' : ''}`
  const t = (payDay ?? '').trim()
  return t || null
}
