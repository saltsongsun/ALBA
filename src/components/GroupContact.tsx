'use client'

import { useEffect, useState } from 'react'
import { phoneFmt } from '@/lib/format'
import { CopyButton } from './ui'

/** 여러 명에게 한 번에 문자 (휴대폰 문자 앱이 받는 사람을 채운 채로 열림) + 번호 전체 복사 */
export function GroupContact({ phones, label, body }: { phones: (string | null | undefined)[]; label: string; body?: string }) {
  const list = [...new Set(phones.map((p) => (p ?? '').replace(/\D/g, '')).filter((p) => p.length >= 9))]
  const [ios, setIos] = useState(false)
  // 아이폰은 여러 명을 addresses=로 받음 (iPadOS는 Mac처럼 보이므로 터치 여부로 구분)
  useEffect(() => {
    const ua = navigator.userAgent
    setIos(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
  }, [])
  if (!list.length) return null
  const q = body ? encodeURIComponent(body) : ''
  const href = ios
    ? `sms:/open?addresses=${list.join(',')}${q ? `&body=${q}` : ''}`
    : `sms:${list.join(',')}${q ? `?body=${q}` : ''}`
  return (
    <div className="flex flex-wrap gap-2">
      <a href={href} className="btn-soft btn-sm">
        {label}
      </a>
      <CopyButton text={list.map(phoneFmt).join(', ')} label={`번호 ${list.length}개 복사`} />
    </div>
  )
}
