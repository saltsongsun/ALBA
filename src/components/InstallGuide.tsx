'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CopyButton } from './ui'
import { APP_NAME } from '@/lib/brand'

// 홈 화면 앱(PWA) 설치 안내. 휴대폰으로 홈 화면에 처음 들어오면 아래에서 올라오고,
// "나중에"를 누르면 7일 동안 숨깁니다. 다른 화면은 버튼(가입·지원·서명·출퇴근)을 가리지 않도록
// 저절로 띄우지 않고, 내 근무 화면에는 위쪽에 작은 권유(InstallBanner)만 둡니다.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type Env = 'kakao' | 'inapp' | 'ios' | 'android' | 'desktop'

const HIDE_KEY = 'alba_install_hide_until'
const OPEN_EVENT = 'alba:install'
const HIDE_DAYS = 7
const AUTO_PATHS = ['/']

function detect(): Env {
  const ua = navigator.userAgent
  if (/KAKAOTALK/i.test(ua)) return 'kakao'
  if (/NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|BAND\/|DaumApps|; wv\)/i.test(ua)) return 'inapp'
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(HIDE_KEY)) > Date.now()
  } catch {
    return false
  }
}

function snooze() {
  try {
    localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86_400_000))
  } catch {}
}

function installed(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline size-4 align-[-3px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="공유">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}

/** 내 근무 화면 위쪽의 작은 설치 권유. 누르면 설치 안내가 열림 (이미 앱이거나 '나중에'를 눌렀으면 숨김) */
export function InstallBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => setShow(!installed() && !snoozed()), [])
  if (!show) return null
  return (
    <div className="flex animate-slide-down items-center gap-3 rounded-2xl bg-brand-50 py-2.5 pr-2 pl-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="size-9 rounded-lg" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug font-semibold text-brand-700">홈 화면에 앱으로 설치하면 출퇴근이 더 빨라요</p>
      <button type="button" className="btn-primary btn-sm" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
        설치
      </button>
      <button
        type="button"
        aria-label="닫기"
        className="rounded-lg px-1.5 py-1 text-brand-700/50 transition active:scale-90"
        onClick={() => {
          snooze()
          setShow(false)
        }}
      >
        ✕
      </button>
    </div>
  )
}

export default function InstallGuide() {
  const pathname = usePathname()
  const [env, setEnv] = useState<Env | null>(null)
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const autoShown = useRef(false)

  useEffect(() => {
    navigator.serviceWorker?.register('/sw.js').catch(() => {})
    if (installed()) return
    setEnv(detect())

    const onPrompt = (ev: Event) => {
      ev.preventDefault()
      setPrompt(ev as InstallPromptEvent)
    }
    const onInstalled = () => {
      setOpen(false)
      setPrompt(null)
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  // 홈·내 근무 화면에서 한 번만 저절로 (컴퓨터는 브라우저가 설치를 지원할 때만)
  useEffect(() => {
    if (!env || autoShown.current || !AUTO_PATHS.includes(pathname)) return
    if (env === 'desktop' && !prompt) return
    autoShown.current = true
    if (!snoozed()) setOpen(true)
  }, [env, pathname, prompt])

  if (!open || !env) return null

  const later = () => {
    snooze()
    setOpen(false)
  }
  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    setPrompt(null)
    if (outcome === 'accepted') setOpen(false)
  }

  let body: React.ReactNode
  if (env === 'kakao') {
    body = (
      <>
        <p className="text-sm text-sub">카카오톡 안에서는 설치할 수 없어요. 휴대폰 기본 브라우저로 연 다음 설치해 주세요.</p>
        <a href={`kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`} className="btn-primary mt-3 w-full">
          브라우저로 열기
        </a>
      </>
    )
  } else if (env === 'inapp') {
    body = (
      <>
        <p className="text-sm text-sub">
          이 앱 안에서는 설치할 수 없어요. 화면 위나 아래의 메뉴(<b>⋮</b> 또는 <b>⋯</b>)에서 <b>‘다른 브라우저로 열기’</b>를 누른 뒤 설치해 주세요.
        </p>
        <CopyButton text={location.href} label="주소 복사" className="btn-gray mt-3 w-full" />
      </>
    )
  } else if (prompt) {
    body = (
      <button type="button" className="btn-primary w-full" onClick={install}>
        설치하기
      </button>
    )
  } else if (env === 'ios') {
    body = (
      <ol className="space-y-1.5 text-sm text-sub">
        <li>
          1. 화면 아래(또는 주소창 옆)의 공유 버튼 <ShareIcon /> 누르기
        </li>
        <li>
          2. 목록에서 <b className="text-ink">‘홈 화면에 추가’</b> 누르기
        </li>
        <li>
          3. 오른쪽 위 <b className="text-ink">‘추가’</b> 누르기
        </li>
      </ol>
    )
  } else {
    body = (
      <p className="text-sm text-sub">
        브라우저 메뉴(<b>⋮</b> 또는 <b>≡</b>)에서 <b className="text-ink">‘홈 화면에 추가’</b> 또는 <b className="text-ink">‘앱 설치’</b>를 눌러 주세요.
      </p>
    )
  }

  return (
    <>
      {/* 안내창에 가려지는 만큼 아래 여백을 두어 맨 아래 버튼까지 스크롤할 수 있게 */}
      <div aria-hidden className="no-print h-96" />
      <div role="dialog" aria-label="앱 설치 안내" className="install-sheet no-print fixed inset-x-0 bottom-0 z-40 p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 sm:p-0">
        <div className="animate-slide-up rounded-2xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-line">
          <div className="mb-3 flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" className="size-11 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{APP_NAME}를 앱으로 설치하세요</p>
              <p className="text-[13px] text-mute">홈 화면에서 바로 열고 출퇴근 버튼을 빨리 누를 수 있어요.</p>
            </div>
          </div>
          {body}
          <button type="button" onClick={later} className="mt-2 w-full py-2 text-sm font-semibold text-mute">
            나중에
          </button>
        </div>
      </div>
    </>
  )
}
