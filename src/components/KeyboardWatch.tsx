'use client'

import { useEffect } from 'react'

const TYPING = /^(checkbox|radio|button|submit|reset|file|range|color|image|hidden)$/
/** 키보드가 올라오는 입력칸인지 (체크 상자·버튼 등은 아님) */
const typing = (el: Element | null) =>
  !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !TYPING.test(el.type)) || (el instanceof HTMLElement && el.isContentEditable))

/**
 * 휴대폰 키보드가 올라와 있는 동안 html[data-kb]를 붙임 (globals.css '키보드').
 * → 아래 탭을 내려 숨기고, 대화 입력칸은 키보드 바로 위로 내려옴.
 * 입력칸에 초점이 있고 화면(visualViewport)이 120px 넘게 줄었을 때만 — 초점만으로는 켜지 않음 (컴퓨터·하드웨어 키보드·화면 테스트에선 그대로).
 *
 * 아이폰(iOS 26~27) 버그 보정: 키보드가 내려간 뒤에도 브라우저가 화면을 '키보드 있는 높이'로 기억해서
 * 고정 칸(머리글·아래 탭·대화 입력칸)이 실제 보이는 화면보다 offsetTop만큼 위에 그려짐
 * (아래 탭이 화면 가운데에 뜨고, 머리글은 위로 사라짐 · 스크롤할 때마다 오르내림).
 * → 입력 중이 아니고 확대도 안 했는데 visualViewport.offsetTop이 남아 있으면 [data-vv] 칸들을 그만큼 내려 실제 화면에 맞춤.
 *   data-vv="pin": 화면에 붙은 칸(머리글·아래 탭·떠 있는 버튼) → 그만큼 내림 (translate)
 *   data-vv="end": 아래에 붙는 sticky 칸(대화 입력칸) → 붙는 기준을 그만큼 낮춤 (--vv, 붙어 있지 않을 땐 그대로)
 * 정상인 기기에선 offsetTop이 늘 0이라 아무것도 하지 않음.
 */
export default function KeyboardWatch() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv || !window.matchMedia('(pointer: coarse)').matches) return
    const root = document.documentElement
    let full = vv.height
    let open = false
    let shift = 0
    let frame = 0
    let watch: MutationObserver | null = null

    const place = () => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-vv]')) {
        if (el.dataset.vv === 'end') {
          if (shift) el.style.setProperty('--vv', `${shift}px`)
          else el.style.removeProperty('--vv')
        } else el.style.translate = shift ? `0 ${shift}px` : ''
      }
    }
    const fix = () => {
      frame = 0
      const next = !typing(document.activeElement) && Math.abs(vv.scale - 1) < 0.02 && vv.offsetTop >= 1 ? Math.round(vv.offsetTop) : 0
      if (next === shift) return
      shift = next
      place()
      // 보정을 풀 때도 미끄러지지 않고 바로 제자리로 (움직임 끄기는 한 장면 뒤에 풂)
      if (shift) root.dataset.vvfix = String(shift)
      else
        requestAnimationFrame(() => {
          if (!shift) delete root.dataset.vvfix
        })
      // 어긋난 동안 새로 나타나는 칸(화면 이동·더보기·맨 위로 버튼)도 맞춤
      if (shift && !watch) {
        watch = new MutationObserver(place)
        watch.observe(document.body, { childList: true, subtree: true })
      } else if (!shift && watch) {
        watch.disconnect()
        watch = null
      }
    }
    const later = () => {
      if (!frame) frame = requestAnimationFrame(fix)
    }

    const check = () => {
      const focused = typing(document.activeElement)
      // 입력 중이 아닐 때의 높이를 '키보드 없는 높이'로 기억 (화면 회전·주소창 변화도 따라감)
      if (!focused) full = vv.height
      else full = Math.max(full, vv.height)
      const next = focused && vv.height < full - 120
      if (next !== open) {
        open = next
        if (open) root.dataset.kb = ''
        else {
          delete root.dataset.kb
          requestAnimationFrame(() => window.scrollTo(window.scrollX, window.scrollY))
        }
      }
      later()
    }
    const focusChange = () => setTimeout(check, 60)
    vv.addEventListener('resize', check)
    vv.addEventListener('scroll', later)
    document.addEventListener('focusin', focusChange)
    document.addEventListener('focusout', focusChange)
    window.addEventListener('pageshow', check)
    return () => {
      vv.removeEventListener('resize', check)
      vv.removeEventListener('scroll', later)
      document.removeEventListener('focusin', focusChange)
      document.removeEventListener('focusout', focusChange)
      window.removeEventListener('pageshow', check)
      if (frame) cancelAnimationFrame(frame)
      watch?.disconnect()
      shift = 0
      place()
      delete root.dataset.kb
      delete root.dataset.vvfix
    }
  }, [])
  return null
}
