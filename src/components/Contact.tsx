import { phoneFmt } from '@/lib/format'

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
    </svg>
  )
}

/** 누르면 휴대폰의 전화·문자 앱이 바로 열리는 버튼 (번호가 없으면 아무것도 그리지 않음) */
export function ContactButtons({
  phone,
  name,
  showNumber = true,
}: {
  phone: string | null | undefined
  name?: string
  showNumber?: boolean
}) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 9) return null
  const who = name ? `${name}에게 ` : ''
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {showNumber && <span className="text-sm whitespace-nowrap text-sub tabular-nums">{phoneFmt(digits)}</span>}
      <a href={`tel:${digits}`} className="contact-btn bg-emerald-50 text-emerald-700 hover:bg-emerald-100" aria-label={`${who}전화`}>
        <PhoneIcon />
        전화
      </a>
      <a href={`sms:${digits}`} className="contact-btn bg-brand-50 text-brand-700 hover:bg-brand-100" aria-label={`${who}문자`}>
        <MessageIcon />
        문자
      </a>
    </span>
  )
}
