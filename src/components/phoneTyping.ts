/**
 * 전화번호 칸: 쓰는 대로 '-'를 넣어 줌 (휴대폰 010-1234-5678 · 서울 02-123-4567 · 지역 055-123-4567 · 대표번호 1588-1234).
 * 글자 중간을 고치는 중이면 건드리지 않음 (커서가 튀지 않게). 저장할 때는 서버가 숫자만 남김.
 */
export function phoneTyping(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 12)
  if (/^1[5-9]\d{2}/.test(d)) return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4, 8)}`
  const area = d.startsWith('02') ? 2 : 3
  if (d.length <= area) return d
  const rest = d.slice(area)
  // 가운데 자리: 끝 4자리를 남기고 3~4자리
  if (rest.length <= 3) return `${d.slice(0, area)}-${rest}`
  const mid = rest.length <= 7 ? rest.length - 4 : 4
  if (mid < 3) return `${d.slice(0, area)}-${rest}`
  return `${d.slice(0, area)}-${rest.slice(0, mid)}-${rest.slice(mid)}`
}

/** 저장된 번호를 칸에 보여 줄 때도 같은 모양으로 (숫자·'-'·빈칸 말고 다른 글자(예: 내선)가 있으면 그대로) */
export function phoneShown(v: string | null | undefined): string {
  if (!v) return ''
  return /^[\d\s-]+$/.test(v) ? phoneTyping(v) : v
}

export function onPhoneInput(e: React.FormEvent<HTMLInputElement>) {
  const el = e.currentTarget
  if (el.selectionStart !== el.value.length) return
  // '02-123-4567 (내선 3)'처럼 숫자 말고 다른 글자를 쓰는 중이면 건드리지 않음
  if (!/^[\d\s-]*$/.test(el.value)) return
  const next = phoneTyping(el.value)
  if (next !== el.value) el.value = next
}
