'use client'

import { useEffect } from 'react'

/** 이 화면에 있는 동안 머리글·아래 탭까지 전문가 화면 색(보라)으로 (로그인 전 전문가 화면·전문가 의뢰 공고) */
export default function ProMode() {
  useEffect(() => {
    const el = document.documentElement
    const before = el.dataset.mode
    el.dataset.mode = 'pro'
    return () => {
      if (before) el.dataset.mode = before
      else delete el.dataset.mode
    }
  }, [])
  return null
}
