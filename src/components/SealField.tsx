'use client'

import { useState } from 'react'

const MAX_SIDE = 600
const MAX_LEN = 520_000 // data URL 길이 (약 380KB)

/** 사진을 읽어 가로·세로 최대 MAX_SIDE로 줄이고, 원하면 흰 종이 배경을 투명하게 (도장만 남김) */
async function toSealPng(file: File, clearBg: boolean, side = MAX_SIDE): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * k))
    const h = Math.max(1, Math.round(img.naturalHeight * k))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, w, h)
    if (clearBg) {
      const data = ctx.getImageData(0, 0, w, h)
      const p = data.data
      const lum = (i: number) => 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]
      // 종이 밝기: 테두리 쪽 점들의 밝기 (실내에서 찍으면 흰 종이도 회색으로 나와서)
      const edge: number[] = []
      const step = Math.max(1, Math.round(Math.min(w, h) / 40))
      for (let x = 0; x < w; x += step) edge.push(lum(x * 4), lum(((h - 1) * w + x) * 4))
      for (let y = 0; y < h; y += step) edge.push(lum(y * w * 4), lum((y * w + w - 1) * 4))
      edge.sort((a, b) => a - b)
      const paper = edge[Math.floor(edge.length / 2)] ?? 255
      for (let i = 0; i < p.length; i += 4) {
        const chroma = Math.max(p[i], p[i + 1], p[i + 2]) - Math.min(p[i], p[i + 1], p[i + 2])
        // 색이 거의 없고 종이만큼 밝은 곳은 투명하게 (빨간 인주는 색이 뚜렷해서 남음), 경계는 부드럽게
        if (chroma < 50) p[i + 3] = Math.max(0, Math.min(255, Math.round((paper - 40 - lum(i)) * 8)))
      }
      ctx.putImageData(data, 0, 0)
    }
    const out = canvas.toDataURL('image/png')
    // 너무 크면 더 줄여서 다시
    return out.length > MAX_LEN && side > 200 ? toSealPng(file, clearBg, Math.round(side * 0.7)) : out
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 직인 올리기: 휴대폰으로 찍은 큰 사진도 올리기 전에 줄여서 보냄 (name="seal_data").
 * 흰 종이 배경은 기본으로 지워서 서류 위에 도장만 찍힌 것처럼 보이게
 */
export default function SealField({ current }: { current: string | null }) {
  const [file, setFile] = useState<File | null>(null)
  const [clearBg, setClearBg] = useState(true)
  const [data, setData] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const make = async (f: File, clear: boolean) => {
    setBusy(true)
    setErr(null)
    try {
      setData(await toSealPng(f, clear))
    } catch {
      setData(null)
      setErr('이 사진은 열 수 없어요. 다른 사진(PNG·JPG)으로 골라 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const shown = data ?? current
  return (
    <div className="flex flex-wrap items-center gap-4">
      {shown ? (
        // 투명한 부분이 보이게 체크무늬 위에
        <span className="grid size-24 place-items-center rounded-xl border border-line bg-[repeating-conic-gradient(#f2f4f6_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="직인" className={`size-full object-contain ${busy ? 'animate-pulse' : ''}`} />
        </span>
      ) : (
        <div className="grid size-24 place-items-center rounded-xl border-2 border-dashed border-line text-xs text-mute">없음</div>
      )}
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <label className="btn-soft btn-sm cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setFile(f)
              make(f, clearBg)
            }}
          />
          {shown ? '직인 바꾸기' : '직인 올리기'}
        </label>
        {file && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={clearBg}
              onChange={(e) => {
                setClearBg(e.target.checked)
                make(file, e.target.checked)
              }}
              className="size-4 accent-brand-600"
            />
            흰 종이 배경 지우기
          </label>
        )}
        <input type="hidden" name="seal_data" value={data ?? ''} />
        <p className="hint">
          {data
            ? '아래 ‘저장’을 눌러야 바뀌어요.'
            : '흰 종이에 찍은 도장을 휴대폰으로 찍어 올려도 돼요. 크기를 줄이고 흰 배경을 지워서 저장해요. 서명 시점의 직인이 서류에 함께 보관됩니다.'}
        </p>
        {err && <p className="font-semibold text-rose-600">{err}</p>}
      </div>
    </div>
  )
}
