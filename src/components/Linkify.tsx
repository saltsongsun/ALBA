/**
 * 채팅 글 속 주소(https://… · www.…)와 휴대폰 번호(010-1234-5678)를 누를 수 있게.
 * 주소는 http·https만 (javascript: 같은 건 그냥 글자) · 새 탭으로 열고 이 앱 주소는 넘기지 않음(noreferrer)
 * 번호는 누르면 전화 걸기. 글자를 그대로 두고 링크만 씌움 (꾹 누르면 복사 메뉴는 그대로)
 */
const PATTERN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']+|01[016789][- ]?\d{3,4}[- ]?\d{4})/g
// 주소 끝에 붙은 문장 부호는 주소에서 뺌 (예: '여기 보세요 https://a.kr/b.' 의 마지막 점)
const TRAIL = /[).,!?;:'"\]}>~]+$/

export function linkify(text: string, mine: boolean, keyPrefix = ''): React.ReactNode[] {
  if (!text) return [text]
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(PATTERN)) {
    const start = m.index ?? 0
    let raw = m[0]
    const isPhone = /^01/.test(raw)
    if (!isPhone) {
      const t = raw.match(TRAIL)?.[0] ?? ''
      // 괄호 안 주소 '(https://a.kr/b)'의 닫는 괄호는 빼되, 주소 속 짝이 맞는 괄호는 남김
      if (t) raw = raw.slice(0, -t.length)
    }
    // 번호는 앞뒤가 숫자로 이어지면 (계좌번호 등) 건드리지 않음
    if (isPhone && (/\d/.test(text[start - 1] ?? '') || /\d/.test(text[start + raw.length] ?? ''))) continue
    let href: string | null = null
    if (isPhone) href = `tel:${raw.replace(/\D/g, '')}`
    else {
      try {
        const u = new URL(raw.startsWith('www.') ? `https://${raw}` : raw)
        if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href
      } catch {}
    }
    if (!href) continue
    out.push(text.slice(last, start))
    out.push(
      <a
        key={`${keyPrefix}${start}`}
        href={href}
        {...(isPhone ? {} : { target: '_blank', rel: 'noopener noreferrer nofollow' })}
        data-chat-link={isPhone ? 'tel' : 'url'}
        className={`break-all underline underline-offset-2 ${mine ? 'text-white decoration-white/70' : 'text-brand-600 decoration-brand-300'}`}
      >
        {raw}
      </a>,
    )
    last = start + raw.length
  }
  if (!out.length) return [text]
  out.push(text.slice(last))
  return out
}
