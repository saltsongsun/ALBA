export function won(n: number | null | undefined): string {
  return `${Math.round(n ?? 0).toLocaleString('ko-KR')}원`
}

export function num(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString('ko-KR')
}

export function phoneFmt(p: string | null | undefined): string {
  if (!p) return ''
  const d = p.replace(/\D/g, '')
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
