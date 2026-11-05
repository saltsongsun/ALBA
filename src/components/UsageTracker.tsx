'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/** 탭마다 바뀌는 무작위 값 (사람을 특정하지 않음 — 같은 탭 안에서 화면 흐름만 이어 보기) */
function sessionId(): string {
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

function send(data: Record<string, unknown>) {
  const body = JSON.stringify({ s: sessionId(), ...data })
  try {
    if (navigator.sendBeacon?.('/api/t', new Blob([body], { type: 'application/json' }))) return
  } catch {}
  fetch('/api/t', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
}

/**
 * 화면 이동 기록(자체 분석): 화면을 열 때 '봄'(바로 전 화면과 함께), 떠나거나 앱을 내릴 때 '머문 시간'.
 * 이름·연락처는 보내지 않음 (회원 유형·성별·나이대는 서버가 붙임)
 */
export default function UsageTracker() {
  const path = usePathname()
  const prev = useRef<string | null>(null)
  const since = useRef(0)
  const shown = useRef(0)

  useEffect(() => {
    if (!path) return
    const last = prev.current
    // 앱 안에서 화면을 옮기면: 떠난 화면에 머문 시간
    if (last && last !== path) {
      const ms = shown.current + (since.current ? Date.now() - since.current : 0)
      if (ms > 0) send({ k: 'leave', p: last, ms })
    }
    if (last !== path) {
      // 바로 전 화면: 새로 고침·주소로 직접 들어와도 이어지게 이 탭에 기억해 둔 것
      let before = last
      if (!before) {
        try {
          before = sessionStorage.getItem('hw_last')
        } catch {}
      }
      send({ k: 'view', p: path, r: before && before !== path ? before : null })
      try {
        sessionStorage.setItem('hw_last', path)
      } catch {}
      prev.current = path
      shown.current = 0
      since.current = document.visibilityState === 'visible' ? Date.now() : 0
    }
  }, [path])

  useEffect(() => {
    // 앱을 내리면 지금 화면에 머문 시간을 보내고, 다시 열면 이어서 셈
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (since.current && prev.current) {
          shown.current += Date.now() - since.current
          since.current = 0
          send({ k: 'leave', p: prev.current, ms: shown.current })
          shown.current = 0
        }
      } else if (!since.current) since.current = Date.now()
    }
    // 다른 주소로 떠나거나 탭을 닫을 때도 (페이지가 내려가기 직전)
    const onHide = () => {
      if (!prev.current) return
      const ms = shown.current + (since.current ? Date.now() - since.current : 0)
      shown.current = 0
      since.current = 0
      if (ms > 0) send({ k: 'leave', p: prev.current, ms })
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])

  return null
}
