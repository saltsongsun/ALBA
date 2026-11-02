'use client'

import { useEffect, useRef, useState } from 'react'
import { usePush } from './usePush'

const SNOOZE_KEY = 'alba_push_nudge_until'
const SNOOZE_MS = 24 * 3600_000
const OPEN_INSTALL = 'alba:install' // InstallGuide를 여는 이벤트

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY)) > Date.now()
  } catch {
    return false
  }
}
function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))
  } catch {}
}
function seen(key: string): boolean {
  try {
    return sessionStorage.getItem(`alba_push_nudge_${key}`) === '1'
  } catch {
    return false
  }
}
function markSeen(key: string) {
  try {
    sessionStorage.setItem(`alba_push_nudge_${key}`, '1')
  } catch {}
}

/**
 * 알림을 아직 안 켠 사람에게 '알림 켜기'를 권하는 창 (켜야 확정·전날 안내·급여 지급을 놓치지 않음).
 * · 평소: '나중에'를 누르면 하루 동안 안 띄움
 * · once(예: 지원 직후): 그 일에 한 번은 하루 쉬기와 상관없이 띄움
 * · 사진 등록 창 같은 다른 창이 열려 있으면 그 창이 닫힌 뒤에
 * · 알림이 막혀 있으면 허용하는 방법, 아이폰·카카오톡 안이면 설치·크롬으로 여는 방법을 안내
 * · 자동 점검 브라우저(navigator.webdriver)에는 띄우지 않음
 */
export default function PushNudge({ publicKey, reason, once, pro = false }: { publicKey: string | null; reason: string; once?: string; pro?: boolean }) {
  const { state, busy, turnOn } = usePush(publicKey)
  const dialog = useRef<HTMLDialogElement>(null)
  const [done, setDone] = useState(false)
  const [askAgain, setAskAgain] = useState(false)
  const shown = useRef(false)

  useEffect(() => {
    if (shown.current || !['off', 'error', 'denied', 'ios-install', 'inapp'].includes(state)) return
    if (navigator.webdriver) return
    if (once ? seen(once) : snoozed()) return
    shown.current = true
    let other: HTMLDialogElement | null = null
    const open = () => {
      if (once) markSeen(once)
      if (!dialog.current?.open) dialog.current?.showModal()
    }
    const t = setTimeout(() => {
      // 사진 등록 창 등이 열려 있으면 닫힌 뒤에
      other = [...document.querySelectorAll('dialog[open]')].find((d) => d !== dialog.current) as HTMLDialogElement | null
      if (other) other.addEventListener('close', open, { once: true })
      else open()
    }, 700)
    return () => {
      clearTimeout(t)
      other?.removeEventListener('close', open)
    }
  }, [state, once])

  const later = () => {
    snooze()
    dialog.current?.close()
  }
  const onTurnOn = async () => {
    setAskAgain(false)
    const ok = await turnOn()
    if (ok) {
      setDone(true)
      setTimeout(() => dialog.current?.close(), 1400)
    } else setAskAgain(true)
  }
  const openInstall = () => {
    snooze()
    dialog.current?.close()
    window.dispatchEvent(new Event(OPEN_INSTALL))
  }

  const blocked = state === 'denied'
  const ios = state === 'ios-install'
  const inapp = state === 'inapp'

  return (
    <dialog
      ref={dialog}
      aria-labelledby="push-nudge-title"
      data-push-nudge
      className="m-auto w-[min(26rem,92vw)] animate-pop rounded-3xl bg-white p-5 shadow-2xl backdrop:bg-black/50"
      onCancel={later}
    >
      {done ? (
        <div className="space-y-2 py-4 text-center">
          <p className="animate-pop text-4xl" aria-hidden>
            🔔
          </p>
          <p className="text-xl font-extrabold">알림을 켰어요</p>
          <p className="text-sm text-sub">이제 중요한 소식을 바로 알려 드릴게요</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-3xl" aria-hidden>
              🔔
            </p>
            <h2 id="push-nudge-title" className="mt-1 text-xl font-extrabold">
              {blocked ? '알림이 막혀 있어요' : ios ? '홈 화면에 추가해 주세요' : inapp ? '크롬으로 열어 주세요' : '알림을 켜 주세요'}
            </h2>
            <p className="mt-1 text-sm text-sub">{reason}</p>
          </div>
          <ul className="flex flex-wrap gap-1.5 text-xs font-semibold text-brand-700">
            {(pro ? ['📄 견적 요청', '✅ 의뢰 확정', '🔔 일정 변경', '💸 대금 지급'] : ['✅ 근무 확정', '⏰ 전날 안내', '🔔 시간·장소 변경', '💸 급여 지급']).map((t) => (
              <li key={t} className="rounded-full bg-brand-50 px-2.5 py-1">
                {t}
              </li>
            ))}
          </ul>
          {blocked ? (
            <ol className="list-decimal space-y-1 rounded-xl bg-bg py-3 pr-3 pl-7 text-sm">
              <li>주소창 왼쪽 아이콘(🔒 또는 ⓘ)을 눌러요</li>
              <li>권한(사이트 설정) → 알림 → 허용</li>
              <li>이 화면을 새로 고치면 끝</li>
            </ol>
          ) : ios ? (
            <p className="rounded-xl bg-bg p-3 text-sm">아이폰은 해피워크를 홈 화면에 추가한 뒤에 알림을 받을 수 있어요.</p>
          ) : inapp ? (
            <p className="rounded-xl bg-bg p-3 text-sm">카카오톡 안에서는 알림을 받을 수 없어요. 크롬(아이폰은 사파리)으로 열어 주세요.</p>
          ) : null}
          {askAgain && state !== 'denied' && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">알림 허용 창이 뜨면 &lsquo;허용&rsquo;을 눌러 주세요</p>
          )}
          {blocked ? (
            <button type="button" onClick={later} className="btn-primary w-full py-3.5 text-base">
              확인했어요
            </button>
          ) : ios || inapp ? (
            <button type="button" onClick={openInstall} className="btn-primary w-full py-3.5 text-base">
              {ios ? '추가하는 방법 보기' : '여는 방법 보기'}
            </button>
          ) : (
            <button type="button" onClick={onTurnOn} disabled={busy} className="btn-primary w-full py-3.5 text-base">
              {busy ? '켜는 중…' : '알림 켜기'}
            </button>
          )}
          {!blocked && (
            <button type="button" onClick={later} className="btn-gray w-full">
              나중에 할게요
            </button>
          )}
        </div>
      )}
    </dialog>
  )
}
