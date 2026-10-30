'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { savePhoto } from '@/app/actions/photo'
import { toSquareJpeg } from '@/lib/photoClient'
import Avatar from './Avatar'
import { ConfirmSubmit, FormMessage } from './ui'

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

/** 가입 화면용 얼굴 사진 칸: 찍거나 고르면 줄여서 폼과 함께 보냄 (name="photo") */
export function PhotoField() {
  const [data, setData] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr(null)
    setBusy(true)
    try {
      setData(await toSquareJpeg(file))
    } catch {
      setErr('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.')
    } finally {
      setBusy(false)
    }
  }
  const input = (capture?: 'user') => (
    <input type="file" accept="image/*" capture={capture} className="sr-only" onChange={onPick} disabled={busy} />
  )

  return (
    <div>
      <p className="label">얼굴 사진</p>
      <div className="flex items-center gap-4">
        {/* 동그라미를 눌러도 고르기 */}
        <label
          aria-label="얼굴 사진 고르기"
          className={`grid size-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full transition active:scale-95 ${
            data ? 'ring-2 ring-brand-500 ring-offset-2' : 'border-2 border-dashed border-line bg-bg text-mute'
          } ${busy ? 'animate-pulse' : ''}`}
        >
          {input()}
          {data ? (
            <img src={data} alt="내 사진" className="size-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.8A1.5 1.5 0 0 1 10.5 3.5h3a1.5 1.5 0 0 1 1.2.7L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
              <circle cx="12" cy="12.5" r="3.5" />
            </svg>
          )}
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            {/* 휴대폰은 카메라 바로 열기 */}
            <span className="hidden pointer-coarse:contents">
              <label className="btn-soft btn-sm cursor-pointer">
                {input('user')}
                {data ? '다시 찍기' : '사진 찍기'}
              </label>
            </span>
            <label className="btn-gray btn-sm cursor-pointer">
              {input()}
              {data ? '다른 사진' : '사진 고르기'}
            </label>
          </div>
          <p className="hint">현장에서 담당자가 알아볼 수 있게 얼굴이 잘 보이는 사진으로 올려 주세요. 담당자만 볼 수 있어요.</p>
        </div>
      </div>
      <input type="hidden" name="photo" value={data ?? ''} />
      {err && <p className="mt-2 text-sm font-medium text-rose-600">{err}</p>}
    </div>
  )
}
