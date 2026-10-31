'use client'

import { useEffect, useRef } from 'react'
import PhotoUpload from './PhotoUpload'

const LATER = 'photo-prompt-later'

/**
 * 얼굴 사진이 없는 근무자(사진 필수 전 가입자 포함)에게 '내 근무'를 열 때 바로 띄우는 등록 창.
 * 올리면 화면이 새로 그려지며 사라지고, '나중에'를 누르면 이번에 연 동안은 다시 안 띄움
 */
export default function PhotoPrompt({ userId, name }: { userId: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let later = false
    try {
      later = sessionStorage.getItem(LATER) === '1'
    } catch {}
    if (!later && !dialog.current?.open) dialog.current?.showModal()
  }, [])
  const close = () => {
    try {
      sessionStorage.setItem(LATER, '1')
    } catch {}
    dialog.current?.close()
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="photo-prompt-title"
      className="m-auto w-[min(26rem,92vw)] animate-pop rounded-3xl bg-white p-5 shadow-2xl backdrop:bg-black/50"
      onCancel={close}
    >
      <div className="space-y-4">
        <div>
          <p className="text-3xl" aria-hidden>
            📷
          </p>
          <h2 id="photo-prompt-title" className="mt-1 text-xl font-extrabold">
            얼굴 사진을 등록해 주세요
          </h2>
          <p className="mt-1 text-sm text-sub">현장에서 담당자가 바로 알아볼 수 있게 얼굴이 잘 보이는 사진 한 장이 필요해요. 사진은 담당자만 볼 수 있어요.</p>
        </div>
        <PhotoUpload userId={userId} name={name} photoAt={null} />
        <button type="button" onClick={close} className="btn-gray w-full">
          나중에 할게요
        </button>
      </div>
    </dialog>
  )
}
