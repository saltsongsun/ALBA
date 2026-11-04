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
 * 키보드가 내려가면 한 번 제자리 스크롤을 해서, 아이폰에서 아래 탭·머리글이 엉뚱한 높이에 남는 일을 막음
 */
export default function KeyboardWatch() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv || !window.matchMedia('(pointer: coarse)').matches) return
    const root = document.documentElement
    let full = vv.height
    let open = false
    const check = () => {
      const focused = typing(document.activeElement)
      // 입력 중이 아닐 때의 높이를 '키보드 없는 높이'로 기억 (화면 회전·주소창 변화도 따라감)
      if (!focused) full = vv.height
      else full = Math.max(full, vv.height)
      const next = focused && vv.height < full - 120
      if (next === open) return
      open = next
      if (open) root.dataset.kb = ''
      else {
        delete root.dataset.kb
        requestAnimationFrame(() => window.scrollTo(window.scrollX, window.scrollY))
      }
    }
    const later = () => setTimeout(check, 60)
    vv.addEventListener('resize', check)
    document.addEventListener('focusin', later)
    document.addEventListener('focusout', later)
    return () => {
      vv.removeEventListener('resize', check)
      document.removeEventListener('focusin', later)
      document.removeEventListener('focusout', later)
      delete root.dataset.kb
    }
  }, [])
  return null
}
