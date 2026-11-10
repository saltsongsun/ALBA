'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 서류의 '(인)' 위에 겹쳐 찍는 직인 그림. 저장된 직인 그림이 깨져 있으면(불러오지 못하면) 그림을 숨겨
 * 계약서·명세서에 깨진 그림 표시와 '직인' 글자가 찍히지 않고 '(인)'만 남게 함.
 * 화면이 준비되기 전에 이미 실패했을 수도 있어서, 준비되면 한 번 더 확인
 */
export default function SealImg({ src, className }: { src: string; className: string }) {
  const ref = useRef<HTMLImageElement>(null)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (el && el.complete && el.naturalWidth === 0) setBroken(true)
  }, [src])
  if (broken) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt="직인" className={className} onError={() => setBroken(true)} data-seal-img />
}
