'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { cleanLabel, send, track } from '@/lib/track'

/**
 * 화면 이동·행동 기록(자체 분석). 이름·연락처·입력한 글은 보내지 않음 (회원 유형·성별·나이대는 서버가 붙임)
 * · 화면을 열 때 '봄'(바로 전 화면과 함께) · 떠날 때 '머문 시간'과 '얼마나 내려 봤는지(%)'
 * · 주요 버튼(data-track: 저장·확정·지원·서명·출퇴근·보내기 등) 누름
 * · 같은 곳을 1초 안에 3번 이상 누름 = 답답함 신호 (어디인지만, 글자는 안 보냄)
 * · 앱 오류 · 화면에 뜬 오류 안내(FormMessage가 보냄)
 * · 앱을 열어 둔 동안 1분마다 '접속 중' 신호 (최고 관리자만 근무자 접속 여부를 봄)
 */
export default function UsageTracker() {
  const path = usePathname()
  const prev = useRef<string | null>(null)
  const since = useRef(0)
  const shown = useRef(0)
  const depth = useRef(0)

  useEffect(() => {
    if (!path) return
    const last = prev.current
    // 앱 안에서 화면을 옮기면: 떠난 화면에 머문 시간 · 내려 본 깊이
    if (last && last !== path) {
      const ms = shown.current + (since.current ? Date.now() - since.current : 0)
      if (ms > 0) send({ k: 'leave', p: last, ms, d: depth.current })
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
      depth.current = 0
      since.current = document.visibilityState === 'visible' ? Date.now() : 0
    }
  }, [path])

  useEffect(() => {
    // 얼마나 내려 봤는지 (화면 높이 대비 %, 가장 깊이 본 곳)
    let raf = 0
    const measure = () => {
      raf = 0
      const el = document.scrollingElement ?? document.documentElement
      const pct = el.scrollHeight > 0 ? Math.min(100, Math.round(((window.scrollY + window.innerHeight) / el.scrollHeight) * 100)) : 100
      if (pct > depth.current) depth.current = pct
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    const first = window.setTimeout(measure, 800)

    // 앱을 내리면 지금 화면에 머문 시간을 보내고, 다시 열면 이어서 셈
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (since.current && prev.current) {
          shown.current += Date.now() - since.current
          since.current = 0
          send({ k: 'leave', p: prev.current, ms: shown.current, d: depth.current })
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
      if (ms > 0) send({ k: 'leave', p: prev.current, ms, d: depth.current })
    }

    // 주요 버튼 누름 + 답답함(같은 곳 연달아 누름)
    let lastTarget: Element | null = null
    let taps: number[] = []
    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null
      if (!t) return
      const tracked = t.closest('[data-track]') as HTMLElement | null
      // 두 번 눌러 확인하는 버튼은 두 번째 누름만 (글자는 처음 버튼 글자로)
      if (tracked && tracked.dataset.confirm !== 'idle') track('click', tracked.dataset.track || tracked.dataset.trackText || tracked.innerText)
      const now = Date.now()
      const spot = t.closest('button, a, [role=button], [data-track], li, section, article, div') ?? t
      if (spot !== lastTarget) {
        lastTarget = spot
        taps = []
      }
      taps = [...taps.filter((x) => now - x < 1000), now]
      if (taps.length === 3) {
        // 어디인지만 (글자는 보내지 않음): 버튼 이름표가 있으면 그것, 없으면 요소 종류와 data 이름
        const name = tracked?.dataset.track || (tracked ? cleanLabel(tracked.innerText) : '')
        const data = Array.from((spot as HTMLElement).attributes ?? [])
          .map((a) => a.name)
          .find((n) => n.startsWith('data-') && n !== 'data-track')
        track('rage', name || `${spot.tagName.toLowerCase()}${data ? `[${data}]` : ''}`)
      }
    }

    // 앱 오류 (메시지 앞부분만)
    const onError = (e: ErrorEvent) => track('error', `앱 오류: ${String(e.message ?? '').slice(0, 40)}`)
    const onRejection = (e: PromiseRejectionEvent) => track('error', `앱 오류: ${String((e.reason as { message?: string })?.message ?? e.reason ?? '').slice(0, 40)}`)

    // 접속 중 신호: 화면을 보고 있는 동안 1분마다
    const ping = window.setInterval(() => {
      if (document.visibilityState === 'visible' && prev.current) send({ k: 'ping', p: prev.current })
    }, 60_000)

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('click', onClick, true)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(ping)
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
