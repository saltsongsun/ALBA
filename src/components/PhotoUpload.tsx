'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { savePhoto } from '@/app/actions/photo'
import Avatar from './Avatar'
import { ConfirmSubmit, FormMessage } from './ui'

const SIZE = 320 // 올리는 사진 가로세로 (목록 동그라미·크게 보기에 충분)
const MAX_CHARS = 150_000

/** 고른 사진을 가운데 정사각형으로 잘라 작은 JPEG로 (세로 사진은 얼굴이 있는 위쪽을 조금 더 살림) */
async function toSquareJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const w = img.naturalWidth
    const h = img.naturalHeight
    const s = Math.min(w, h)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (w - s) / 2, h > w ? (h - s) * 0.3 : 0, s, s, 0, 0, SIZE, SIZE)
    let q = 0.86
    let out = canvas.toDataURL('image/jpeg', q)
    while (out.length > MAX_CHARS && q > 0.5) {
      q -= 0.12
      out = canvas.toDataURL('image/jpeg', q)
    }
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 얼굴 사진 올리기. 고르면 바로 줄여서 올림.
 * admin이면 관리자가 그 근무자 사진을 바꾸고, 아니면 본인 사진.
 */
export default function PhotoUpload({
  userId,
  name,
  photoAt,
  admin = false,
  children,
}: {
  userId: string
  name: string
  photoAt: string | null
  admin?: boolean
  children?: React.ReactNode
}) {
  const [state, action, pending] = useActionState(savePhoto.bind(null, admin ? userId : null), null)
  const form = useRef<HTMLFormElement>(null)
  const photo = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const has = !!(preview || photoAt)
  // 올리지 못했으면 미리보기를 거둠
  useEffect(() => {
    if (state?.error) setPreview(null)
  }, [state])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 사진을 다시 골라도 동작하게
    if (!file) return
    setErr(null)
    setBusy(true)
    try {
      const data = await toSquareJpeg(file)
      setPreview(data)
      photo.current!.value = data
      form.current!.requestSubmit()
    } catch {
      setErr('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const working = busy || pending
  const pick = (capture?: 'user' | 'environment') => (
    <label className={`${capture ? 'btn-gray' : 'btn-soft'} btn-sm cursor-pointer ${working ? 'pointer-events-none opacity-60' : ''}`}>
      <input type="file" accept="image/*" capture={capture} className="sr-only" onChange={onPick} disabled={working} />
      {capture ? '바로 찍기' : has ? '사진 바꾸기' : '사진 올리기'}
    </label>
  )

  return (
    <div id="photo" className="scroll-mt-24 space-y-3">
      <div className="flex items-center gap-4">
        <div className={`relative ${working ? 'animate-pulse' : ''}`}>
          <Avatar id={userId} name={name} photoAt={photoAt} src={preview} size="xl" />
        </div>
        <div className="min-w-0 flex-1">
          {children}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pick()}
            {/* 카메라 바로 열기는 휴대폰에서만 (컴퓨터에선 파일 고르기와 같아서) */}
            <span className="hidden pointer-coarse:contents">{pick(admin ? 'environment' : 'user')}</span>
            {has && !working && (
              <form action={action} onSubmit={() => setPreview(null)}>
                <input type="hidden" name="remove" value="1" />
                <ConfirmSubmit className="btn-gray btn-sm text-rose-600" confirmText="지울까요?">
                  지우기
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </div>
      </div>
      <form ref={form} action={action} hidden>
        <input ref={photo} type="hidden" name="photo" />
      </form>
      <p className="hint">
        {admin
          ? '현장에서 알아볼 수 있게 얼굴이 잘 보이게 찍어 주세요. 본인에게 동의를 받고 찍어 주세요. 관리자만 볼 수 있어요.'
          : '현장에서 담당자가 알아볼 수 있게 얼굴이 잘 보이는 사진을 올려 주세요. 담당자만 볼 수 있어요.'}
        {working && ' · 올리는 중…'}
      </p>
      <FormMessage state={err ? { error: err } : state} />
    </div>
  )
}
