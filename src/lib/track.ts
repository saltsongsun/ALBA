/**
 * 화면 이동·행동 기록 보내기 (자체 분석 · 브라우저에서만).
 * 탭마다 바뀌는 무작위 값만 보냄 — 이름·연락처는 보내지 않음 (회원 유형·성별·나이대는 서버가 붙임)
 */
export function sessionId(): string {
  try {
    let s = sessionStorage.getItem('hw_sid')
    if (!s) {
      s = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20)
      sessionStorage.setItem('hw_sid', s)
    }
    return s
  } catch {
    return 'nostorage00'
  }
}

export function send(data: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const body = JSON.stringify({ s: sessionId(), ...data })
  try {
    if (navigator.sendBeacon?.('/api/t', new Blob([body], { type: 'application/json' }))) return
  } catch {}
  fetch('/api/t', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
}

/** 버튼 이름 등을 기록용으로 다듬기: 숫자는 #, 한 줄, 30자까지 */
export function cleanLabel(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\d/g, '#')
    .replace(/[^\p{L}\p{N}#\s·:/()'?!.,~\[\]_=›-]/gu, '')
    .trim()
    .slice(0, 30)
}

/** 행동 하나 기록 (click · error · rage) */
export function track(kind: 'click' | 'error' | 'rage', label: string) {
  const l = cleanLabel(label)
  if (!l || typeof location === 'undefined') return
  send({ k: kind, p: location.pathname, l })
}
