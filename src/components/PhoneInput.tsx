'use client'

import { onPhoneInput } from './phoneTyping'

/** 서버 화면에서 쓰는 휴대폰 번호 칸: 쓰는 대로 '-'를 넣어 줌 (저장할 때는 서버가 숫자만 남김) */
export default function PhoneInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onInput' | 'type'>) {
  return <input inputMode="tel" maxLength={13} {...props} onInput={onPhoneInput} />
}
