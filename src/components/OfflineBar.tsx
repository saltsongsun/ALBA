'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

/** 서버에 닿는지 가볍게 확인 (휴대폰이 '끊김'이라고 해도 실제로는 닿는 경우가 있어 한 번 더 봄) */
const reach = () =>
  fetch('/robots.txt', { method: 'HEAD', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(4000) }).then(
    () => true,
    () => false,
  )

/**
 * 인터넷이 끊겼을 때 (행사장처럼 신호가 약한 곳).
 * · 위에 작은 안내가 내려옴: '인터넷이 끊겼어요 · 연결되면 이어져요' → 돌아오면 '다시 연결됐어요'
 *   (몇 초 뒤에는 '인터넷 끊김' 한마디로 줄어듦 — 끊긴 동안 계속 떠 있어도 화면을 덜 가리게)
 * · 끊긴 동안 다른 화면으로 가는 링크·보내기를 누르면 막고 알려 줌
 *   — 그대로 두면 '연결 없음' 화면으로 넘어가 보던 화면과 쓰던 내용(문의·지원서 등)을 잃음
 * 출퇴근 버튼은 따로 처리함 (연결되면 자동으로 다시 누름 · worker.tsx)
 */
export default function OfflineBar() {
  const [state, setState] = useState<'on' | 'off' | 'back'>('on')
  const [hint, setHint] = useState<'link' | 'form' | null>(null)
  const [bump, setBump] = useState(0)
  // 긴 안내를 보여 주는 중인지 (몇 초 뒤 한마디로 줄어듦 · 막을 때마다 다시 펼쳐짐)
  const [wide, setWide] = useState(true)
  const off = useRef(false)

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | undefined
    let hide: ReturnType<typeof setTimeout> | undefined
    let shrink: ReturnType<typeof setTimeout> | undefined
    const open = () => {
      setWide(true)
      clearTimeout(shrink)
      shrink = setTimeout(() => {
        setWide(false)
        setHint(null)
      }, 4500)
    }
    const goOn = () => {
      if (!off.current) return
      off.current = false
      clearInterval(poll)
      clearTimeout(shrink)
      setHint(null)
      setState('back')
      clearTimeout(hide)
      hide = setTimeout(() => setState('on'), 2400)
    }
    const check = async () => {
      if (await reach()) return goOn()
      if (off.current) return
      off.current = true
      clearTimeout(hide)
      setState('off')
      open()
      // 'online' 신호가 오지 않는 기기도 있어 몇 초마다 다시 확인
      clearInterval(poll)
      poll = setInterval(async () => (await reach()) && goOn(), 5000)
    }
    const onOffline = () => void check()
    const onOnline = () => void check()
    // 끊긴 동안: 다른 화면으로 가는 링크 · 보내기(폼)를 막고 알려 줌
    const say = (kind: 'link' | 'form', e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      setHint(kind)
      setBump((n) => n + 1)
      open()
    }
    const onClick = (e: MouseEvent) => {
      if (!off.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null
      if (!(a instanceof HTMLAnchorElement) || a.target === '_blank' || a.hasAttribute('download')) return
      if (!/^https?:$/.test(a.protocol) || a.origin !== location.origin) return // 전화·문자·다른 사이트는 그대로
      if (a.pathname === location.pathname && a.search === location.search && a.hash) return // 같은 화면 안에서 자리만 옮김
      say('link', e)
    }
    const onSubmit = (e: Event) => {
      if (!off.current) return
      const f = e.target
      if (f instanceof HTMLFormElement && (f.method === 'dialog' || f.hasAttribute('data-offline-ok'))) return
      say('form', e)
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    const first = setTimeout(() => !navigator.onLine && void check(), 0)
    return () => {
      clearTimeout(first)
      clearTimeout(hide)
      clearTimeout(shrink)
      clearInterval(poll)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
    }
  }, [])

  if (state === 'on') return null
  const back = state === 'back'
  const small = !back && !wide
  return (
    // 긴 안내는 가운데 · 줄어든 한마디는 머리글 바로 아래 오른쪽 틈에 (내용을 가리지 않게 작게)
    <div
      className={`no-print pointer-events-none fixed inset-x-0 z-50 flex px-4 ${small ? 'top-[calc(env(safe-area-inset-top)+3.6rem)] justify-end' : 'top-[calc(env(safe-area-inset-top)+4rem)] justify-center'}`}
      role="status"
      aria-live="polite"
      data-offline={state}
    >
      {/* 막을 때마다 다시 흔들리게 key를 바꿈 */}
      <p
        key={back ? 'back' : bump}
        data-offline-wide={!back && wide ? '1' : '0'}
        className={`flex max-w-full items-center rounded-full font-semibold whitespace-nowrap text-white shadow-lg ${small ? 'gap-1.5 px-2.5 py-1 text-xs' : 'gap-2 px-4 py-2 text-sm'} ${
          back ? 'animate-pop bg-emerald-600' : `bg-ink ${bump ? 'animate-shake' : 'animate-slide-down'}`
        }`}
      >
        <Icon name={back ? 'check' : 'wifiOff'} className="shrink-0" />
        <span className="min-w-0 truncate" data-offline-text>
          {back
            ? '다시 연결됐어요'
            : !wide
              ? '인터넷 끊김'
              : hint === 'link'
              ? '인터넷이 연결되면 열 수 있어요'
              : hint === 'form'
                ? '연결되면 다시 눌러 주세요 · 내용은 그대로예요'
                : '인터넷이 끊겼어요 · 연결되면 이어져요'}
        </span>
      </p>
    </div>
  )
}
