export function won(n: number | null | undefined): string {
  return `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`
}

export function num(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString('ko-KR')
}

/**
 * 저장된 번호를 보기 좋게 (휴대폰 010-1234-5678 · 서울 02-1234-5678 / 02-123-4567 · 지역 055-123-4567 · 대표번호 1588-1234).
 * 숫자·'-'·빈칸 말고 다른 글자(예: 내선)가 있으면 그대로 (번호 칸에 쓸 때와 같은 모양)
 */
export function phoneFmt(p: string | null | undefined): string {
  if (!p) return ''
  if (!/^[\d\s-]+$/.test(p)) return p
  const d = p.replace(/\D/g, '')
  if (/^1[5-9]\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`
  if (/^02\d{7,8}$/.test(d)) return `02-${d.slice(2, -4)}-${d.slice(-4)}`
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return p
}

/** 계좌번호 끝 4자리만 */
export function maskAccount(acc: string | null | undefined): string {
  if (!acc) return ''
  const d = acc.replace(/\s/g, '')
  return d.length <= 4 ? d : `${'*'.repeat(Math.min(d.length - 4, 8))}${d.slice(-4)}`
}

/**
 * 금액을 소리 내어 읽듯이: 1,500,000 → '150만 원', 123,456,789 → '1억 2,345만 6,789원'.
 * 큰 금액을 칠 때 0을 하나 더·덜 쳤는지 바로 보이게 (은행 앱처럼)
 */
export function wonReadable(n: number): string {
  const v = Math.floor(Math.abs(n))
  if (v < 10000) return `${v.toLocaleString('ko-KR')}원`
  const eok = Math.floor(v / 1e8)
  const man = Math.floor((v % 1e8) / 1e4)
  const rest = v % 1e4
  const parts: string[] = []
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`)
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`)
  if (rest) parts.push(rest.toLocaleString('ko-KR'))
  return rest ? `${parts.join(' ')}원` : `${parts.join(' ')} 원`
}

/** 숫자 → 한글 금액 (임금명세서 "일금 ○○원정") */
export function wonKorean(n: number): string {
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  const small = ['', '십', '백', '천']
  const big = ['', '만', '억', '조']
  let v = Math.floor(Math.abs(n))
  if (v === 0) return '영'
  let out = ''
  let group = 0
  while (v > 0) {
    const chunk = v % 10000
    if (chunk) {
      let s = ''
      let c = chunk
      for (let i = 0; i < 4 && c > 0; i++) {
        const dgt = c % 10
        if (dgt) s = digits[dgt] + small[i] + s
        c = Math.floor(c / 10)
      }
      out = s + big[group] + out
    }
    v = Math.floor(v / 10000)
    group++
  }
  return out
}

/** 가린 휴대폰 번호: 010-****-4444 */
export function maskPhone(p: string | null | undefined): string {
  const d = (p ?? '').replace(/\D/g, '')
  if (d.length < 8) return d ? '***' : ''
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`
}

/** 가린 주소: 앞의 두 단어(시·도 시·군·구)만 */
export function maskAddress(a: string | null | undefined): string {
  const w = (a ?? '').trim().split(/\s+/).filter(Boolean)
  return w.length ? `${w.slice(0, 2).join(' ')} ···` : ''
}

/** 가린 이름: 김*아 */
export function maskName(n: string | null | undefined): string {
  const s = [...(n ?? '').trim()]
  if (s.length <= 1) return s.join('')
  if (s.length === 2) return `${s[0]}*`
  return `${s[0]}${'*'.repeat(s.length - 2)}${s[s.length - 1]}`
}

/** 마지막 접속 (최고 관리자만 봄): 5분 안이면 '접속 중', 아니면 'N분/시간/일 전' (30일 넘으면 null) */
export const ONLINE_MS = 5 * 60_000
export function seenText(iso: string | null | undefined, now = Date.now()): { online: boolean; text: string } | null {
  if (!iso) return null
  const ago = now - Date.parse(iso)
  if (!Number.isFinite(ago)) return null
  if (ago < ONLINE_MS) return { online: true, text: '접속 중' }
  const m = Math.floor(ago / 60_000)
  if (m < 60) return { online: false, text: `${m}분 전 접속` }
  const h = Math.floor(m / 60)
  if (h < 24) return { online: false, text: `${h}시간 전 접속` }
  const d = Math.floor(h / 24)
  if (d <= 30) return { online: false, text: `${d}일 전 접속` }
  return null
}
