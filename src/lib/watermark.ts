import type { CSSProperties } from 'react'
import { kstDateTime } from './time'

/** 서류 배경 워터마크: 글자를 옅게 비스듬히 반복 (화면·인쇄·PDF 모두 찍힘) */
export function watermarkStyle(text: string): CSSProperties {
  const esc = text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='170'><text x='150' y='95' text-anchor='middle' transform='rotate(-24 150 85)' fill='rgba(37,87,232,0.13)' font-size='14' font-weight='700' font-family='Pretendard Variable, sans-serif'>${esc}</text></svg>`
  return {
    backgroundImage: `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`,
    backgroundRepeat: 'repeat',
    printColorAdjust: 'exact',
    WebkitPrintColorAdjust: 'exact',
  }
}

/** 워터마크 글자: 누가 언제 열람(출력)했는지. 관리자는 '관리자 열람'으로 구분 */
export function viewerMark(viewer: { name: string; phone: string; role: string }, now = new Date()): string {
  return viewer.role === 'admin' ? `관리자 열람 ${kstDateTime(now)} · ${viewer.name}` : `열람 ${kstDateTime(now)} · ${viewer.name} ${viewer.phone.slice(-4)}`
}
