'use client'

import { useRef } from 'react'

const SIZES = {
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-xs',
  lg: 'size-14 text-base',
  xl: 'size-24 text-2xl',
} as const

// 사진이 없을 때 이름 글자를 얹는 바탕색 (사람마다 같은 색)
const TINTS = [
  'bg-brand-50 text-brand-700',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-700',
  'bg-rose-50 text-rose-600',
  'bg-violet-50 text-violet-700',
  'bg-sky-50 text-sky-700',
]

export function photoSrc(id: string, photoAt: string) {
  return `/photo/${id}?v=${Date.parse(photoAt)}`
}

/** 이름 두 글자 (김지원 → 지원, 외자·외국 이름은 앞 글자) */
function initials(name: string) {
  const n = name.trim()
  return /^[가-힣]{3,4}$/.test(n) ? n.slice(-2) : n.slice(0, 1).toUpperCase()
}

/**
 * 근무자 얼굴 사진 (없으면 이름 글자). zoom이면 눌러서 크게 보기.
 * 링크 안에 넣을 때는 zoom={false} (링크 안에 버튼을 둘 수 없어서)
 */
export default function Avatar({
  id,
  name,
  photoAt,
  size = 'md',
  zoom = true,
  src,
}: {
  id: string
  name: string
  photoAt?: string | null
  size?: keyof typeof SIZES
  zoom?: boolean
  /** 방금 고른 사진 미리보기 (올리는 중) */
  src?: string | null
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const url = src ?? (photoAt ? photoSrc(id, photoAt) : null)
  const box = `${SIZES[size]} shrink-0 overflow-hidden rounded-full`

  if (!url) {
    let h = 0
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
    return (
      <span aria-hidden className={`${box} grid place-items-center font-bold ${TINTS[Math.abs(h) % TINTS.length]}`}>
        {initials(name)}
      </span>
    )
  }
  const img = <img src={url} alt={`${name} 사진`} className="size-full object-cover" loading="lazy" decoding="async" />
  if (!zoom) return <span className={`${box} inline-block bg-bg ring-1 ring-line`}>{img}</span>
  return (
    <>
      <button
        type="button"
        aria-label={`${name} 사진 크게 보기`}
        className={`${box} bg-bg ring-1 ring-line transition active:scale-95`}
        onClick={() => dialog.current?.showModal()}
      >
        {img}
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(20rem,86vw)] animate-pop overflow-hidden rounded-3xl bg-white p-0 shadow-2xl backdrop:bg-black/60"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <img src={url} alt={`${name} 사진`} className="block aspect-square w-full bg-bg object-cover" />
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <p className="font-bold">{name}</p>
          <button type="button" className="btn-gray btn-sm" onClick={() => dialog.current?.close()}>
            닫기
          </button>
        </div>
      </dialog>
    </>
  )
}
