'use client'

import HolderHint from './HolderHint'
import UnsavedBar from '@/components/UnsavedBar'
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { createPortal } from 'react-dom'
import {
  changePin,
  clockIn,
  clockOut,
  closeForgotten,
  notifyLate,
  requestClockIn,
  requestFix,
  requestFullTime,
  signDocument,
  updateProfile,
  withdraw,
  type ClockResult,
} from '@/app/actions/worker'
import { BANKS } from '@/lib/privacy'
import { fixTime } from '@/lib/signals'
import { kstDate, kstTime, minutesText } from '@/lib/time'
import AccountDigits from './AccountDigits'
import { onAccountPaste } from './accountPaste'
import { onPhoneInput, phoneShown } from './phoneTyping'
import Fold from './Fold'
import { FormMessage, haptic, keepInputs, SubmitButton } from './ui'

type GeoProblem = 'denied' | 'failed'

/** 현재 위치. 못 얻으면 권한이 꺼진 것(denied)인지 잡지 못한 것(failed)인지 함께 알려 줌 */
function getPosition(): Promise<{ pos: { lat: number; lng: number } | null; problem: GeoProblem | null }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve({ pos: null, problem: 'failed' })
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ pos: { lat: p.coords.latitude, lng: p.coords.longitude }, problem: null }),
      (e) => resolve({ pos: null, problem: e.code === 1 ? 'denied' : 'failed' }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

/** 위치를 못 쓸 때: 지금 쓰는 휴대폰·브라우저에 맞춰 위치를 켜는 방법 */
function LocationHelp({ problem, required, quiet = false }: { problem: GeoProblem; required: boolean; quiet?: boolean }) {
  const [env, setEnv] = useState<'kakao' | 'ios' | 'android' | 'other'>('other')
  useEffect(() => {
    const ua = navigator.userAgent
    setEnv(/KAKAOTALK/i.test(ua) ? 'kakao' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other')
  }, [])
  return (
    <div role="status" className="animate-pop space-y-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-bold">📍 {problem === 'denied' ? '위치 권한이 꺼져 있어요' : '위치를 찾지 못했어요'}</p>
      {/* 위에 같은 말(오류)이 이미 떠 있으면 되풀이하지 않음 */}
      {!quiet && <p>{required ? '이 행사는 현장에서만 근무 시작을 누를 수 있어요.' : '위치 없이도 기록되지만, 켜 두면 현장 확인이 정확해요.'}</p>}
      {problem === 'failed' ? (
        <p>건물 밖이나 창가에서 잠시 뒤 다시 눌러 주세요. 휴대폰 설정에서 위치(GPS)가 켜져 있는지도 확인해 주세요.</p>
      ) : env === 'kakao' ? (
        <>
          <p>카카오톡 안에서는 위치를 쓰지 못할 수 있어요. 기본 브라우저로 열어서 눌러 주세요.</p>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => (location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`)}
          >
            기본 브라우저로 열기
          </button>
        </>
      ) : env === 'ios' ? (
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>설정 앱 → 개인정보 보호 및 보안 → 위치 서비스 켜기</li>
          <li>같은 화면 아래 Safari 웹사이트 → ‘앱을 사용하는 동안’</li>
          <li>이 화면으로 돌아와 다시 누르고, 위치 허용을 눌러 주세요</li>
        </ol>
      ) : env === 'android' ? (
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>주소창 왼쪽 아이콘(자물쇠·ⓘ) → 권한 → 위치 ‘허용’</li>
          <li>화면 위에서 아래로 내려 ‘위치’가 켜져 있는지 확인</li>
          <li>이 화면으로 돌아와 다시 눌러 주세요</li>
        </ol>
      ) : (
        <p>브라우저 주소창의 사이트 설정에서 위치를 ‘허용’으로 바꾼 뒤 다시 눌러 주세요.</p>
      )}
    </div>
  )
}

// 출퇴근 성공 때 사방으로 튀는 점 (거리 px, 색)
const BURST = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2
  const r = 64 + (i % 3) * 14
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), c: ['#10b981', '#2557e8', '#f59e0b', '#f43f5e'][i % 4] }
})

function elapsedText(fromIso: string, now: number): string {
  const min = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000))
  const h = Math.floor(min / 60)
  return h ? `${h}시간 ${min % 60}분` : `${min}분`
}

/**
 * 출근 전 오늘 근무 카드: 시작까지 남은 시간, 시작 시각이 지났으면 근무 시작을 누르라고 (30초마다 갱신)
 * serverNow로 처음 그려서 서버·브라우저 화면이 같게
 */
export function StartCountdown({ startAt, endAt, startText, serverNow }: { startAt: string; endAt: string; startText: string; serverNow: number }) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const diff = Math.round((Date.parse(startAt) - now) / 60_000)
  const span = (m: number) => {
    const h = Math.floor(m / 60)
    return h ? `${h}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`
  }
  // 3시간보다 많이 남았거나 근무 시간이 다 지났으면 표시 안 함
  if (diff > 180 || now >= Date.parse(endAt)) return null
  return diff > 0 ? (
    <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700">
      <span aria-hidden>⏱</span> {startText} 시작까지 {span(diff)}
    </p>
  ) : (
    // 두 줄로 나눠 짧게: 굵게 '얼마나 지났는지' · 아래 작게 '할 일' (360px에서 세 줄로 들쭉날쭉 꺾이던 것)
    <p className="flex items-center gap-2.5 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700" data-start-late>
      <span aria-hidden>⚠️</span>
      <span className="min-w-0">
        <b className="block font-semibold">
          {diff === 0 ? `${startText} 시작 시각이에요` : `${startText} 시작 · ${span(-diff)} 지났어요`}
        </b>
        <span className="block text-xs">도착했다면 근무 시작을 눌러 주세요</span>
      </span>
    </p>
  )
}

export function ClockPanel({
  jobId,
  open,
  useLocation,
  gpsRequired = false,
  endAt,
  endText,
  serverNow,
  askedAt = null,
  startAt,
}: {
  /** 오늘 근무 시작 시각(ISO): 한 시간도 더 전에 '근무 시작'을 누르면 한 번 더 묻기 (집에서 실수로 누르지 않게) */
  startAt?: string
  jobId: string
  open: { id: string; clock_in: string; startText: string } | null
  useLocation: boolean
  /** 현장 반경 안에서만 근무 시작 가능 */
  gpsRequired?: boolean
  /** 계약 종료 시각 (지나면 근무 종료를 누르라고 안내) */
  endAt?: string
  endText?: string
  /** 서버가 그린 시각: 처음 화면을 서버와 같게 그려서 (분이 바뀌는 순간에도) 경과 시간 글자가 어긋나지 않게 */
  serverNow?: number
  /** 오늘 담당자에게 보낸 출근 확인 요청 시각 (HH:MM, 아직 처리 전) */
  askedAt?: string | null
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ClockResult | null>(null)
  const [now, setNow] = useState(() => serverNow ?? Date.now())
  const [step, setStep] = useState('')
  // 시작 직후 같은 자리의 버튼이 '근무 종료'로 바뀌므로, 두 번 눌러야 종료되게 해서 실수를 막음
  const [confirmOut, setConfirmOut] = useState(false)
  // 시작 한 시간도 더 전에 '근무 시작'을 누르면: 남은 시간 문구 (한 번 더 눌러야 시작)
  const [early, setEarly] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState(0)
  const [geo, setGeo] = useState<GeoProblem | null>(null)
  // 인터넷이 끊겨 기록하지 못했으면 연결되는 대로 다시 시도 (지하 행사장 등)
  const [offline, setOffline] = useState(false)
  const lastPos = useRef<{ lat: number; lng: number } | null>(null)
  const [asked, setAsked] = useState<ClockResult | null>(null)
  const [asking, startAsk] = useTransition()
  // 현장 위치 확인에 연달아 막힌 횟수: 두 번째부터는 같은 버튼을 또 누르지 않게 출근 확인 요청 칸으로 데려감
  const [gpsFails, setGpsFails] = useState(0)
  // 막힌 횟수는 오늘 이 공고 기준으로 잠깐 기억 (인사이트: 위치에 막힌 근무자가 홈·문의를 오가며 화면을 다시 열 때마다
  // 횟수가 0으로 돌아가 '담당자에게 출근 확인 요청'으로 바뀌지 않고 근무 시작만 계속 누름)
  const failKey = `gps-fails:${jobId}:${kstDate()}`
  useEffect(() => {
    try {
      const n = Number(sessionStorage.getItem(failKey))
      if (n > 0) setGpsFails(n)
    } catch {}
  }, [failKey])
  const countGps = (failed: boolean) =>
    setGpsFails((n) => {
      const v = failed ? n + 1 : 0
      try {
        if (v) sessionStorage.setItem(failKey, String(v))
        else sessionStorage.removeItem(failKey)
      } catch {}
      return v
    })
  const askBox = useRef<HTMLDivElement>(null)
  // '근무 종료하러 가기'(/me#clock)로 왔으면 버튼을 화면 가운데로 (위에 카드가 많으면 영역 머리만 보이고 버튼은 화면 밖이던 것)
  // 문의 채팅의 '근무 시작하러 가기' 버튼으로 와도 같음 · 버튼 둘레가 몇 번 번쩍여서 어디를 누를지 바로 보이게
  const mainBtn = useRef<HTMLButtonElement>(null)
  // 근무 시작 전에도 (문의 채팅 '근무 시작하러 가기' · 마지막 서류 서명 뒤) — 화면에 보이는 첫 근무 버튼 하나만
  useEffect(() => {
    if (location.hash !== '#clock') return
    let off = 0
    const t = setTimeout(() => {
      const el = mainBtn.current
      // 접힌 칸 안(오늘 근무일이 아닌 사람의 '담당자가 오늘 나와 달라고 했나요?') 버튼은 건너뜀
      const first = [...document.querySelectorAll<HTMLElement>('[data-clock-main]')].find((b) => b.checkVisibility?.() ?? true)
      if (!el || first !== el) return
      el.scrollIntoView({ block: 'center' })
      el.setAttribute('data-flash', '')
      off = window.setTimeout(() => el.removeAttribute('data-flash'), 3200)
    }, 60)
    return () => {
      clearTimeout(t)
      clearTimeout(off)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 위치 권한이 이미 꺼져 있으면 누르기 전에 미리 알려 줌 (지원하는 브라우저만)
  useEffect(() => {
    if (!useLocation || !navigator.permissions?.query) return
    let status: PermissionStatus | null = null
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        status = s
        const sync = () => setGeo((g) => (s.state === 'denied' ? 'denied' : g === 'denied' ? null : g))
        sync()
        s.onchange = sync
      })
      .catch(() => {})
    return () => {
      if (status) status.onchange = null
    }
  }, [useLocation])

  useEffect(() => {
    if (!confirmOut) return
    const t = setTimeout(() => setConfirmOut(false), 4000)
    return () => clearTimeout(t)
  }, [confirmOut])
  useEffect(() => {
    if (!early) return
    // 버튼이 화면 아래(탭 줄 근처)에 있어도 아래 안내가 가려지지 않게
    mainBtn.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(() => setEarly(null), 5000)
    return () => clearTimeout(t)
  }, [early])

  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [open])

  const press = () => {
    if (open && !confirmOut) {
      haptic(10)
      setConfirmOut(true)
      return
    }
    // 시작 한 시간도 더 전: 한 번 더 눌러야 시작 (현장에 일찍 온 거면 그대로 한 번 더)
    if (!open && startAt && !early) {
      const left = Math.round((Date.parse(startAt) - Date.now()) / 60_000)
      if (left > 60) {
        haptic(10)
        setEarly(`${Math.floor(left / 60)}시간${left % 60 ? ` ${left % 60}분` : ''}`)
        return
      }
    }
    setConfirmOut(false)
    setEarly(null)
    run()
  }

  const run = () =>
    start(async () => {
      setResult(null)
      setAsked(null)
      let pos: { lat: number; lng: number } | null = null
      if (useLocation) {
        setStep('위치 확인 중…')
        const r = await getPosition()
        pos = r.pos
        setGeo(r.problem)
      }
      lastPos.current = pos
      setStep('기록 중…')
      let res: ClockResult
      try {
        if (!navigator.onLine) throw new Error('offline')
        res = open ? await clockOut(open.id, pos?.lat ?? null, pos?.lng ?? null) : await clockIn(jobId, pos?.lat ?? null, pos?.lng ?? null)
      } catch {
        // 서버에 닿지 못함: 화면이 오류로 바뀌지 않게 하고, 연결되면 자동으로 다시 누름
        setStep('')
        setOffline(true)
        setResult({ error: `인터넷 연결이 약해 기록하지 못했어요. 연결되면 자동으로 다시 ${open ? '종료' : '시작'}을 눌러 드릴게요.` })
        return
      }
      setOffline(false)
      setResult(res)
      countGps(!!res.gps)
      setStep('')
      setNow(Date.now())
      if (res.ok) {
        const id = Date.now()
        setCelebrate(id)
        setTimeout(() => setCelebrate((c) => (c === id ? 0 : c)), 1500)
      }
    })

  // 연결이 돌아오면 한 번 다시 시도 (계속 안 되면 다음 연결 때 또)
  const retry = useRef(run)
  retry.current = run
  const busy = useRef(false)
  busy.current = pending
  useEffect(() => {
    if (!offline) return
    const again = () => !busy.current && retry.current()
    window.addEventListener('online', again)
    const t = setInterval(() => navigator.onLine && again(), 20_000)
    return () => {
      window.removeEventListener('online', again)
      clearInterval(t)
    }
  }, [offline])

  // 현장 위치 확인에 막혔을 때: 담당자에게 출근 확인 요청 (요청한 시각으로 출근 처리)
  const ask = () =>
    startAsk(async () => {
      try {
        setAsked(await requestClockIn(jobId, lastPos.current?.lat ?? null, lastPos.current?.lng ?? null))
      } catch {
        setAsked({ error: '인터넷 연결이 약해요. 신호가 잡히는 곳에서 다시 눌러 주세요.' })
      }
    })

  // 요청해 둔 것 (서버 기록 또는 방금 보낸 것)
  const waiting = !open && (!!askedAt || !!asked?.ok)
  // 출근 확인 요청 칸: 위치에 막혔을 때, 또는 현장 확인이 필요한 공고인데 위치 권한이 꺼진 걸 미리 알 때 (누르기 전부터)
  const showAsk = !open && !pending && !waiting && (!!result?.gps || (gpsRequired && geo === 'denied'))
  // 위치 확인에 두 번 연달아 막히면: 큰 버튼을 '담당자에게 출근 확인 요청'으로 바꿈
  // (이용 기록: 위치에 막힌 근무자가 근무 시작만 예닐곱 번씩 다시 누르고, 아래의 출근 확인 요청은 거의 누르지 않았음)
  // '위치 다시 확인'은 큰 버튼 아래 작은 버튼으로 남김
  const stuck = showAsk && gpsFails >= 2
  // (요청 칸은 처리 중엔 숨었다가 끝나면 다시 그려지므로, 다시 보일 때 옮김)
  useEffect(() => {
    if (stuck) mainBtn.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [stuck])

  return (
    // 근무 중이면 '근무 종료하러 가기'(/me#clock)가 여기로 데려옴
    <div id={open ? 'clock' : undefined} className="relative scroll-mt-24 space-y-3">
      {celebrate > 0 && (
        <div key={celebrate} aria-hidden className="burst">
          {BURST.map((d, i) => (
            <i key={i} style={{ '--x': `${d.x}px`, '--y': `${d.y}px`, background: d.c } as React.CSSProperties} />
          ))}
          <span className="grid size-16 animate-pop place-items-center rounded-full bg-white shadow-xl ring-4 ring-emerald-100">
            <svg viewBox="0 0 24 24" className="size-9 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="check-draw" />
            </svg>
          </span>
        </div>
      )}
      {open && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">
          <span className="flex items-center gap-2 font-semibold">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            근무 중 · {open.startText} 시작
          </span>
          <span className="text-sm font-bold">{elapsedText(open.clock_in, now)}</span>
        </div>
      )}
      {/* 계약 종료까지 얼마나 남았는지 */}
      {open && endAt && now < Date.parse(endAt) && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-700"
              style={{
                width: `${Math.min(100, Math.max(2, ((now - Date.parse(open.clock_in)) / Math.max(1, Date.parse(endAt) - Date.parse(open.clock_in))) * 100))}%`,
              }}
            />
          </div>
          <p className="text-right text-xs font-semibold text-sub">
            종료({endText})까지 {elapsedText(new Date(now).toISOString(), Date.parse(endAt))}
          </p>
        </div>
      )}
      {open && endAt && now >= Date.parse(endAt) && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          계약 종료 시각({endText})이 지났어요. 일이 끝났으면 근무 종료를 눌러 주세요. 이후 시간은 담당자와 서로 확인한 뒤에만 급여에 들어가요.
        </p>
      )}
      {/* 담당자에게 출근 확인을 요청해 둔 상태: 다시 같은 버튼을 누르며 헤매지 않게 기다리는 중임을 알려 줌 (확인되면 화면이 저절로 바뀜) */}
      {waiting && (
        <div role="status" data-arrive-wait className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-100">
          <p className="flex items-center gap-2 font-bold">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-brand-500" />
            </span>
            {askedAt ? `${askedAt} 출근 확인 요청함` : '출근 확인 요청함'}
          </p>
          <p className="mt-0.5">담당자가 확인하면 요청한 시각으로 출근 처리되고, 이 화면도 저절로 바뀌어요.</p>
        </div>
      )}
      {stuck ? (
        <div className="space-y-2" data-clock-stuck>
          <button
            ref={mainBtn}
            data-clock-main
            type="button"
            onClick={ask}
            disabled={asking}
            data-track="출근 확인 요청"
            className="w-full rounded-2xl bg-brand-600 py-5 text-xl font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {asking ? '요청 중…' : '담당자에게 출근 확인 요청'}
          </button>
          <p className="text-center text-sm text-sub">현장에 도착했다면 눌러 주세요. 확인되면 지금 시각으로 출근 처리돼요.</p>
          <button type="button" onClick={press} disabled={pending} className="mx-auto block py-1 text-sm font-semibold text-sub underline-offset-2 hover:underline" data-retry-gps>
            {pending ? step || '확인 중…' : '위치 다시 확인하고 근무 시작'}
          </button>
          {asked?.error && <p className="text-center text-sm font-semibold text-rose-600">{asked.error}</p>}
        </div>
      ) : (
      <button
        ref={mainBtn}
        data-clock-main
        type="button"
        onClick={press}
        disabled={pending}
        data-track={!open ? '근무 시작' : '근무 종료'}
        data-confirm={open && !confirmOut ? 'idle' : undefined}
        className={`w-full rounded-2xl py-5 text-xl font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60 ${
          !open
            ? 'bg-emerald-500 hover:bg-emerald-600'
            : confirmOut
              ? 'bg-rose-700 shadow-rose-300'
              : 'bg-rose-500 hover:bg-rose-600'
        }`}
      >
        {pending ? step || '처리 중…' : !open ? (early ? '한 번 더 누르면 시작' : '근무 시작') : confirmOut ? '한 번 더 누르면 종료' : '근무 종료'}
      </button>
      )}
      {confirmOut && !pending && <p className="text-center text-sm font-semibold text-rose-600">실수로 끝나지 않도록 한 번 더 눌러야 종료돼요.</p>}
      {early && !pending && !open && (
        <p className="text-center text-sm text-amber-700" data-early-start>
          <b className="block font-semibold">시작까지 {early} 남았어요</b>
          <span className="block text-xs">현장에 왔으면 한 번 더 눌러 주세요</span>
        </p>
      )}
      {useLocation && !result && !geo && <p className="text-center text-xs text-mute">버튼을 누르면 현장 위치도 함께 기록돼요.</p>}
      <FormMessage state={result} />
      {offline && !pending && (
        <button type="button" onClick={run} className="btn-gray btn-sm w-full">
          지금 다시 시도
        </button>
      )}
      {showAsk && !stuck && (
        <div
          ref={askBox}
          data-arrive-ask
          data-strong={gpsFails >= 2 ? '' : undefined}
          className={`animate-pop space-y-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-brand-100 ${gpsFails >= 2 ? 'ring-2 ring-brand-400' : 'ring-1'}`}
        >
          <p className="font-bold">{geo ? '위치를 켜기 어렵나요?' : '현장에 도착했는데 위치가 안 맞나요?'}</p>
          <p>
            {geo
              ? '현장에 도착했다면 담당자에게 요청해 주세요. 확인되면 지금 시각으로 출근 처리돼요.'
              : '실내나 지하에서는 위치가 멀게 잡힐 수 있어요. 담당자에게 요청하면 지금 시각으로 출근 처리해 줘요.'}
          </p>
          <button type="button" onClick={ask} disabled={asking} data-track="출근 확인 요청" className="btn-primary btn-sm disabled:opacity-60">
            {asking ? '요청 중…' : '담당자에게 출근 확인 요청'}
          </button>
          {asked?.error && <p className="font-semibold text-rose-600">{asked.error}</p>}
        </div>
      )}
      {/* 요청해 두고 기다리는 동안엔 접어 둠 (다시 눌러 막혔을 때만) */}
      {useLocation && geo && !pending && (!waiting || !!result) && <LocationHelp problem={geo} required={gpsRequired && !open} quiet={!!result?.gps} />}
    </div>
  )
}

/**
 * 지난 근무의 종료를 깜빡했을 때 (다음 날 열면 '근무 중 25시간'으로 보이던 것):
 * 예정 종료 시각으로 한 번에, 또는 실제로 끝난 시각을 골라 종료
 */
export function ForgotClockOut({
  attendanceId,
  dateLabel,
  startText,
  endText,
}: {
  attendanceId: string
  dateLabel: string
  startText: string
  endText: string
}) {
  const [state, action] = useActionState(closeForgotten.bind(null, attendanceId), null)
  const [custom, setCustom] = useState(false)
  return (
    <form action={action} className="space-y-3 rounded-xl bg-amber-50 px-4 py-3.5 text-amber-900 ring-1 ring-amber-200">
      <div>
        <p className="font-bold">⏰ {dateLabel} 근무 종료를 누르지 않았어요</p>
        <p className="mt-0.5 text-sm">
          {startText}에 시작한 근무가 아직 ‘근무 중’이에요. 끝난 시각을 알려 주세요.
        </p>
      </div>
      {!custom ? (
        <>
          <input type="hidden" name="end" value="planned" />
          <SubmitButton className="btn-primary w-full" pendingText="기록 중…">
            예정 종료 시각 {endText}에 끝났어요
          </SubmitButton>
          <button type="button" onClick={() => setCustom(true)} className="btn-gray btn-sm w-full">
            다른 시각에 끝났어요
          </button>
        </>
      ) : (
        <>
          <input type="hidden" name="end" value="custom" />
          <label className="block">
            <span className="label text-amber-900">실제로 끝난 시각</span>
            <input type="time" name="end_time" defaultValue={endText} required className="input bg-white" />
          </label>
          <p className="text-xs">
            예정 종료({endText})보다 늦게까지 일했다면 그 시간은 담당자와 서로 확인한 뒤 급여에 들어가요.
          </p>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" onClick={() => setCustom(false)} className="btn-gray">
              취소
            </button>
            <SubmitButton className="btn-primary" pendingText="기록 중…">
              이 시각으로 종료
            </SubmitButton>
          </div>
        </>
      )}
      <FormMessage state={state} />
      <p className="text-xs text-amber-800">입력하면 담당자에게도 알려져요.</p>
    </form>
  )
}

/**
 * 오늘 기록이 잘못 찍혔을 때 (종료를 실수로 일찍 누름 등): 담당자에게 정정 요청.
 * 근무 완료 카드 아래에 작게 두고, 누르면 펼쳐짐
 */
/**
 * 일찍 끝났어도 시간 인정받기 (사용자 요청 2026-11-07): 오늘 근무를 예정 종료 시각보다 일찍 마쳤을 때
 * '근로조건대로 HH:MM까지 인정해 주세요' 요청 → 담당자가 승인하면 종료 시각이 예정 종료 시각으로 (정산에 그대로)
 */
export function FullTimeRequest({ attendanceId, endText, outText, sent }: { attendanceId: string; endText: string; outText: string; sent: string | null }) {
  const [state, action] = useActionState(requestFullTime.bind(null, attendanceId), null)
  const [open, setOpen] = useState(false)
  const done = state?.ok
  if (done || sent)
    return (
      <p className="animate-pop rounded-xl bg-violet-50 px-3.5 py-2.5 text-sm text-violet-900" role="status" data-full-time-sent>
        🙏 {done ?? <>{sent}에 <b>근로조건대로 {endText}까지</b> 인정을 요청했어요 · 담당자 확인 중</>}
      </p>
    )
  return (
    <div className="space-y-2 rounded-xl bg-bg px-3.5 py-3" data-full-time>
      <p className="text-sm">
        <b>예정({endText})보다 일찍 끝났어요</b>
        <span className="block text-xs text-sub">담당자가 일찍 보내 줬다면 근로조건대로 {endText}까지 인정을 요청할 수 있어요</span>
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-soft w-full" data-full-time-open>
          {endText}까지 시간 인정받기
        </button>
      ) : (
        <form action={action} className="animate-pop space-y-2">
          <input name="reason" maxLength={100} className="input bg-white text-sm" placeholder="사유 (선택) 예: 비 때문에 일찍 마침" />
          <FormMessage state={state} />
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-gray">
              취소
            </button>
            <SubmitButton className="btn-primary" pendingText="보내는 중…" track="시간 인정 요청">
              담당자에게 요청하기
            </SubmitButton>
          </div>
          <p className="hint">
            승인되면 종료 {outText} → {endText}로 바뀌어요
          </p>
        </form>
      )}
    </div>
  )
}

export function FixRequest({
  attendanceId,
  workDate,
  inAt,
  outAt,
  inText,
  outText,
  sent,
}: {
  attendanceId: string
  /** 근무 날 (YYYY-MM-DD) · 지금 기록된 출근·종료 (ISO) — 고른 시각을 서버와 같은 방식으로 바로 확인 */
  workDate: string
  inAt: string
  outAt: string
  inText: string
  outText: string
  /** 보내 놓고 아직 답을 못 받은 요청 */
  sent: { field: 'in' | 'out'; time: string; at: string } | null
}) {
  const [state, action] = useActionState(requestFix.bind(null, attendanceId), null)
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<'in' | 'out'>('out')
  const [time, setTime] = useState(outText)
  const done = state?.ok
  // 보내기 전에 바로 확인 (인사이트: '아직 오지 않은 시각이에요'를 보낸 뒤에야 봄)
  // warn: 노란 테두리로 알림 · 아니면 '바꿀 시각을 골라 주세요'처럼 조용히 안내만 (둘 다 보내기 막음)
  const fixHint = ((): { warn: boolean; text: string } | null => {
    if (!/^\d{2}:\d{2}$/.test(time)) return { warn: false, text: '실제 시각을 골라 주세요' }
    if (time === (field === 'in' ? inText : outText)) return { warn: false, text: '지금 기록된 시각이에요 · 실제 시각으로 바꿔 주세요' }
    const want = fixTime(workDate, { field, time }, new Date(inAt)).getTime()
    if (want > Date.now() + 60_000) return { warn: true, text: `아직 오지 않은 시각이에요 · 지금 ${kstTime(new Date())}` }
    if (field === 'in' && want >= new Date(outAt).getTime()) return { warn: true, text: `출근은 종료(${outText})보다 앞이어야 해요` }
    return null
  })()
  useEffect(() => {
    if (done) setOpen(false)
  }, [done])
  return (
    <div className="space-y-2">
      {done ? (
        <p className="rounded-xl bg-violet-50 px-3.5 py-2.5 text-sm font-semibold text-violet-800">✏️ {done}</p>
      ) : (
        sent && (
          <p className="rounded-xl bg-violet-50 px-3.5 py-2.5 text-sm text-violet-900">
            ✏️ {sent.at}에 <b>실제 {sent.field === 'in' ? '출근' : '종료'} {sent.time}</b>(으)로 정정을 요청했어요 · 담당자 확인 중
          </p>
        )
      )}
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setTime(field === 'in' ? inText : outText)
          }}
          className="w-full text-center text-sm font-semibold text-sub underline underline-offset-4"
        >
          {sent || done ? '다시 요청하기' : '시각이 잘못 찍혔나요? 정정 요청'}
        </button>
      ) : (
        <form action={action} onReset={keepInputs} className="animate-pop space-y-3 rounded-xl bg-bg p-3.5">
          <p className="text-sm font-bold">어느 시각이 틀렸나요?</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['in', `출근 ${inText}`],
                ['out', `종료 ${outText}`],
              ] as const
            ).map(([v, label]) => (
              <label
                key={v}
                className={`cursor-pointer rounded-xl px-3 py-2.5 text-center text-sm font-bold ring-1 transition active:scale-95 ${
                  field === v ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-sub ring-line'
                }`}
              >
                <input
                  type="radio"
                  name="field"
                  value={v}
                  checked={field === v}
                  onChange={() => {
                    setField(v)
                    setTime(v === 'in' ? inText : outText)
                  }}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
          <label className="block">
            <span className="label">실제 {field === 'in' ? '출근' : '종료'} 시각</span>
            <input
              key={field}
              type="time"
              name="time"
              defaultValue={field === 'in' ? inText : outText}
              onInput={(e) => setTime(e.currentTarget.value)}
              required
              aria-invalid={fixHint?.warn ? true : undefined}
              aria-describedby="fix-hint"
              className={`input bg-white ${fixHint?.warn ? 'border-amber-400 ring-2 ring-amber-200' : ''}`}
            />
          </label>
          {fixHint && (
            <p
              id="fix-hint"
              className={`-mt-1.5 text-xs ${fixHint.warn ? 'font-semibold text-amber-700' : 'text-mute'}`}
              data-fix-hint={fixHint.warn ? 'warn' : 'note'}
              role="status"
            >
              {fixHint.text}
            </p>
          )}
          <input name="reason" maxLength={100} className="input bg-white text-sm" placeholder="사유 (선택) 예: 실수로 종료를 일찍 눌렀어요" />
          <FormMessage state={state} />
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-gray">
              취소
            </button>
            <SubmitButton className="btn-primary" pendingText="보내는 중…" disabled={!!fixHint}>
              정정 요청 보내기
            </SubmitButton>
          </div>
          <p className="hint">담당자가 확인하고 고쳐 주면 알림이 와요. 직접 고칠 수는 없어요.</p>
        </form>
      )}
    </div>
  )
}

const LATE_CHOICES = [10, 20, 30, 60]

/**
 * 늦을 것 같을 때 담당자에게 알리기 (오늘 근무 카드, 출근 전).
 * 시작 전: '얼마나 늦을 것 같나요?' (시작에서 n분) · 시작 시각이 지났으면: '언제쯤 도착해요?' (지금부터 n분 뒤)
 * 고르는 칸마다 도착 예정 시각을 함께 보여 줌
 */
export function LateNotice({
  jobId,
  sent,
  startAt,
  started,
}: {
  jobId: string
  sent: { minutes: number; eta: string; at: string } | null
  /** 오늘 근무 시작 시각 (ISO) */
  startAt: string
  /** 화면을 그릴 때 이미 시작 시각이 지났는지 */
  started: boolean
}) {
  const [state, action, pending] = useActionState(notifyLate.bind(null, jobId), null)
  const [openForm, setOpenForm] = useState(false)
  const [minutes, setMinutes] = useState(sent && LATE_CHOICES.includes(sent.minutes) ? sent.minutes : 10)
  // 도착 예정 시각의 기준 (칸을 연 때 · 서버도 '지금과 시작 중 늦은 때'에서 더함)
  const [base, setBase] = useState(0)
  const done = state?.ok
  useEffect(() => {
    if (done) setOpenForm(false)
  }, [done])
  const open = () => {
    setBase(Math.max(Date.now(), Date.parse(startAt)))
    setOpenForm(true)
  }
  const arrive = (m: number) => (base ? kstTime(new Date(base + m * 60_000)) : '')
  return (
    <div className="space-y-2">
      {sent && !state && (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          🕒 {sent.at}에 담당자에게 <b>약 {minutesText(sent.minutes)} 늦음</b>(도착 예정 {sent.eta})을 알렸어요.
        </p>
      )}
      {!openForm ? (
        <button type="button" onClick={open} className="btn-gray btn-sm w-full" data-late-open={started ? 'started' : 'before'}>
          🕒 {started ? (sent || done ? '도착 시간 다시 알리기' : '가는 중이에요 · 도착 시간 알리기') : sent || done ? '늦는 시간 다시 알리기' : '늦을 것 같아요 · 담당자에게 알리기'}
        </button>
      ) : (
        <form action={action} className="animate-pop space-y-3 rounded-xl bg-bg p-3.5">
          <p className="text-sm font-bold">{started ? '언제쯤 도착해요?' : '얼마나 늦을 것 같나요?'}</p>
          <div className="grid grid-cols-4 gap-1.5" data-late-choices>
            {LATE_CHOICES.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer flex-col items-center rounded-xl py-2 text-center ring-1 transition active:scale-95 ${
                  minutes === m ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-sub ring-line'
                }`}
              >
                <input type="radio" name="minutes" value={m} checked={minutes === m} onChange={() => setMinutes(m)} className="sr-only" />
                <span className="text-sm font-bold whitespace-nowrap">
                  {m === 60 ? '1시간' : `${m}분`}
                  {started && ' 뒤'}
                </span>
                {/* 이 칸을 고르면 도착 예정 시각 (고른 칸은 톡) */}
                <span key={minutes === m ? 'on' : 'off'} className={`text-[11px] tabular-nums ${minutes === m ? 'animate-pop text-white/90' : 'text-mute'}`} data-late-eta={arrive(m)}>
                  {arrive(m)}
                </span>
              </label>
            ))}
          </div>
          <input name="reason" maxLength={100} className="input py-2.5 text-sm" placeholder="사유 (선택) 예: 버스 지연" />
          <div className="flex gap-2">
            <SubmitButton className="btn-primary btn-sm flex-1" pendingText="보내는 중…">
              담당자에게 알리기
            </SubmitButton>
            <button type="button" onClick={() => setOpenForm(false)} className="btn-gray btn-sm">
              닫기
            </button>
          </div>
        </form>
      )}
      <FormMessage state={state} />
    </div>
  )
}

/** 서명으로 받을 최소 길이 (px · 점 하나·짧은 선은 안 됨) */
const MIN_INK = 40

export function SignaturePad({
  name,
  reuse = null,
  invalid = false,
  onDrawn,
}: {
  name: string
  /** 앞 서류에 방금 한 서명 (있으면 '같은 서명 쓰기') */
  reuse?: string | null
  /** 서명 없이 제출하려 했을 때: 빨간 테두리 + 안내 */
  invalid?: boolean
  /** 서명이 생기면 (그리기·같은 서명 쓰기) */
  onDrawn?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)
  // 그린 길이(px): 한 번 톡 누른 점이나 아주 짧은 선은 서명으로 받지 않음 (인사이트: 서명란을 여러 번 톡톡 누름)
  const ink = useRef(0)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [short, setShort] = useState(false)
  // 손가락을 대고 있는 동안 서명란 테두리를 브랜드 색으로 (그리고 있다는 느낌)
  const [active, setActive] = useState(false)

  // 앞 서류와 같은 서명: 그 그림을 서명란에 그대로 놓고 같은 이미지로 제출
  const applySaved = () => {
    if (!reuse) return
    const img = new Image()
    img.onload = () => {
      const c = canvasRef.current!
      const r = c.getBoundingClientRect()
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, r.width, r.height)
      const k = Math.min(r.width / img.width, r.height / img.height)
      ctx.drawImage(img, (r.width - img.width * k) / 2, (r.height - img.height * k) / 2, img.width * k, img.height * k)
      inputRef.current!.value = reuse
      ink.current = MIN_INK
      setShort(false)
      setEmpty(false)
      onDrawn?.()
    }
    img.src = reuse
  }

  useEffect(() => {
    const c = canvasRef.current!
    const ratio = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * ratio
    c.height = rect.height * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const exportImage = () => {
    const c = canvasRef.current!
    const out = document.createElement('canvas')
    const w = 500
    out.width = w
    out.height = Math.round((c.height / c.width) * w)
    out.getContext('2d')!.drawImage(c, 0, 0, out.width, out.height)
    inputRef.current!.value = out.toDataURL('image/png')
  }

  return (
    <div data-sign-pad data-invalid={invalid && empty ? '' : undefined} data-sign-short={short && empty ? '' : undefined}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className={`h-44 w-full touch-none rounded-xl border-2 bg-white transition-colors duration-200 ${
            active ? 'border-solid border-brand-400' : `border-dashed ${invalid && empty ? 'border-rose-400' : short && empty ? 'border-amber-400' : 'border-line'}`
          }`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = true
            setActive(true)
            const ctx = e.currentTarget.getContext('2d')!
            const p = point(e)
            last.current = p
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x + 0.1, p.y + 0.1)
            ctx.stroke()
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return
            const ctx = e.currentTarget.getContext('2d')!
            const p = point(e)
            if (last.current) ink.current += Math.hypot(p.x - last.current.x, p.y - last.current.y)
            last.current = p
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
          }}
          onPointerUp={() => {
            if (!drawing.current) return
            drawing.current = false
            last.current = null
            setActive(false)
            // 아직 너무 짧으면 서명으로 받지 않음 (그린 건 그대로 두고 이어서 쓰게)
            if (ink.current < MIN_INK) {
              setShort(true)
              return
            }
            setShort(false)
            setEmpty(false)
            exportImage()
            onDrawn?.()
          }}
          onPointerCancel={() => {
            drawing.current = false
            last.current = null
            setActive(false)
          }}
        />
        {empty ? (
          !short && (
            <span className={`pointer-events-none absolute inset-0 grid place-items-center ${invalid ? 'font-semibold text-rose-600' : 'text-mute'}`}>
              {invalid ? '손가락으로 여기에 서명해 주세요' : '여기에 서명해 주세요'}
            </span>
          )
        ) : (
          <span className="badge pointer-events-none absolute top-2 right-2 animate-pop bg-emerald-50 text-emerald-700">서명됨 ✓</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {short && empty && (
          <p className="mr-auto animate-pop text-sm font-semibold text-amber-700" role="status" data-sign-short-hint>
            조금 더 길게 이름을 써 주세요
          </p>
        )}
        {reuse && empty && (
          <button type="button" onClick={applySaved} className="btn-soft btn-sm mr-auto">
            ✍️ 앞 서류와 같은 서명 쓰기
          </button>
        )}
        <button
          type="button"
          className="btn-gray btn-sm"
          onClick={() => {
            const c = canvasRef.current!
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
            inputRef.current!.value = ''
            ink.current = 0
            setShort(false)
            setEmpty(true)
          }}
        >
          다시 쓰기
        </button>
      </div>
      <input ref={inputRef} type="hidden" name={name} />
    </div>
  )
}

/**
 * 긴 서류를 휴대폰으로 볼 때: 서명란이 화면에 안 보이는 동안 아래에 '서명하러 가기' 버튼 (누르면 서명란으로)
 */
export function JumpToSign() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = document.getElementById('sign')
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { rootMargin: '0px 0px -10% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  if (!show) return null
  // 화면 전환 효과(transform) 안에서는 fixed가 화면이 아니라 그 상자 기준이 되므로 body에 붙임
  return createPortal(
    <button
      type="button"
      onClick={() => document.getElementById('sign')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      data-vv="pin"
      className="no-print fixed inset-x-4 bottom-[calc(var(--tabbar-space)+10px)] z-30 mx-auto max-w-md animate-pop rounded-2xl bg-brand-600 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-600/30 active:scale-[0.98] sm:bottom-6"
    >
      ✍️ 다 읽었어요 · 서명하러 가기 ↓
    </button>,
    document.body,
  )
}

const noSubscribe = () => () => {}
/**
 * 서명할 서류를 읽는 동안 머리글 바로 아래 얇은 막대가 읽은 만큼 채워짐 (얼마나 남았는지 보이게).
 * 스크롤에 맞춰 CSS만으로 움직임(globals.css '.read-progress') — 지원하지 않는 브라우저에선 안 보임.
 * 화면 전환 효과(transform) 안에서는 fixed가 그 상자 기준이 되므로 body에 붙임
 */
export function ReadProgress() {
  const client = useSyncExternalStore(noSubscribe, () => true, () => false)
  if (!client) return null
  return createPortal(<div aria-hidden data-read-progress data-vv="pin" className="read-progress no-print" />, document.body)
}

/** 이 기기에서 방금 한 서명 (서류가 여러 건이면 같은 서명을 다시 그리지 않게). 같은 계정·30분 안에만 */
const LAST_SIGNATURE = 'hw-last-signature'
const REUSE_MS = 30 * 60_000

export function SignForm({ docId, title, userId }: { docId: string; title: string; userId: string }) {
  const [state, action] = useActionState(signDocument.bind(null, docId), null)
  const [saved, setSaved] = useState<string | null>(null)
  // 서명 없이 '제출'을 누르면 서버까지 가지 않고 바로 서명란으로 (빨간 테두리 · 흔들림)
  const [needSign, setNeedSign] = useState(false)
  // 동의 체크 없이 '제출'을 누르면: 휴대폰 브라우저 기본 말풍선(앱마다 모양·말이 다름) 대신 체크 칸을 흔들고 바로 아래 안내
  const [needAgree, setNeedAgree] = useState(false)
  useEffect(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(LAST_SIGNATURE) ?? 'null') as { u?: string; at?: number; data?: string } | null
      if (v?.u === userId && typeof v.at === 'number' && Date.now() - v.at < REUSE_MS && v.data?.startsWith('data:image/png;base64,')) setSaved(v.data)
      else sessionStorage.removeItem(LAST_SIGNATURE)
    } catch {}
  }, [userId])
  return (
    <form
      action={action}
      onReset={keepInputs}
      onSubmit={(e) => {
        const sig = new FormData(e.currentTarget).get('signature')
        if (!(typeof sig === 'string' && sig.startsWith('data:image/png;base64,'))) {
          e.preventDefault()
          setNeedSign(true)
          haptic([20, 40, 20])
          const pad = e.currentTarget.querySelector<HTMLElement>('[data-sign-pad]')
          if (pad) {
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            pad.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
            pad.classList.remove('animate-shake')
            void pad.offsetWidth
            pad.classList.add('animate-shake')
          }
          return
        }
        const agree = e.currentTarget.querySelector<HTMLInputElement>('input[name=agree]')
        if (agree && !agree.checked) {
          e.preventDefault()
          setNeedAgree(true)
          haptic([20, 40, 20])
          const box = e.currentTarget.querySelector<HTMLElement>('[data-sign-agree]')
          if (box) {
            box.classList.remove('animate-shake')
            void box.offsetWidth
            box.classList.add('animate-shake')
          }
          agree.focus({ preventScroll: true })
          return
        }
        try {
          sessionStorage.setItem(LAST_SIGNATURE, JSON.stringify({ u: userId, at: Date.now(), data: sig }))
        } catch {}
      }}
      id="sign"
      // 확인은 위 onSubmit에서 (서명 → 동의 차례로 · 기본 말풍선 대신 화면 안내)
      noValidate
      className="card no-print scroll-mt-20 space-y-4"
    >
      <h2 className="font-bold">근로자 서명</h2>
      <SignaturePad
        name="signature"
        reuse={saved}
        invalid={needSign}
        onDrawn={() => {
          setNeedSign(false)
          // 그린 서명을 '바뀐 값'으로 알림 → 제출 전에 다른 화면으로 나가려 하면 한 번 멈춤 (아래 UnsavedBar)
          document.getElementById('sign')?.dispatchEvent(new Event('input', { bubbles: true }))
        }}
      />
      {/* 실수 막기: 서명을 그려 놓고 아래 탭 등을 잘못 누르면 서명이 사라짐 → 한 번 멈추고 '한 번 더 누르면 나가요' */}
      <UnsavedBar formId="sign" state={state} bar={false} warnText="서명 제출 전이에요 · 한 번 더 누르면 나가요" />
      <div className="space-y-1.5">
        <label
          data-sign-agree
          className={`flex items-start gap-2.5 rounded-xl text-sm transition-colors duration-200 ${needAgree ? '-mx-2 bg-rose-50 px-2 py-2 ring-1 ring-rose-300' : ''}`}
        >
          <input
            type="checkbox"
            name="agree"
            className="mt-0.5 size-5 shrink-0 accent-brand-600"
            required
            aria-invalid={needAgree || undefined}
            aria-describedby={needAgree ? 'sign-agree-hint' : undefined}
            onChange={(e) => e.currentTarget.checked && setNeedAgree(false)}
          />
          <span>위 「{title}」 내용을 모두 읽고 이해했으며, 전자서명으로 체결(제출)하는 데 동의합니다.</span>
        </label>
        {needAgree && (
          <p id="sign-agree-hint" role="alert" className="animate-pop text-sm font-semibold text-rose-600" data-sign-agree-hint>
            위 동의 칸에 체크해야 제출할 수 있어요
          </p>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3.5 text-base" pendingText="제출 중…">
        서명하고 제출하기
      </SubmitButton>
    </form>
  )
}

/** 내 정보 '정보 채우기'에서 바로 가는 칸 (주소 끝 #이름) */
const PROFILE_FIELDS = ['bank_account', 'emergency_phone', 'address'] as const
type ProfileField = (typeof PROFILE_FIELDS)[number]

/**
 * 급여 계좌·연락 정보. 칸마다 이름표를 붙여 값이 채워져 있어도 무슨 칸인지 보이게.
 * 아직 비어 있는 꼭 필요한 칸(need: 계좌번호·주소)은 노란 테두리 — 쓰기 시작하면 바로 사라짐.
 * '정보 채우기'에서 누르고 오면(#bank_account 등) 그 칸을 화면 가운데로 옮기고 커서
 */
export function ProfileForm({
  initial,
  need = [],
  ownName,
}: {
  initial: { address: string; emergency_phone: string; bank_name: string; bank_account: string; account_holder: string }
  need?: ProfileField[]
  /** 알바: 예금주가 이 이름과 다르면 바로 알려 줌 (전문가·업체는 상호 계좌도 써서 안 봄) */
  ownName?: string
}) {
  const [state, action] = useActionState(updateProfile, null)
  const ref = useRef<HTMLFormElement>(null)
  const [acct, setAcct] = useState(initial.bank_account)
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(location.hash.slice(1)) as ProfileField
      if (!PROFILE_FIELDS.includes(id)) return
      const el = ref.current?.querySelector<HTMLInputElement>(`#${id}`)
      if (!el) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
      el.focus({ preventScroll: true })
      el.classList.remove('animate-pop')
      void el.offsetWidth
      el.classList.add('animate-pop')
    }
    go()
    window.addEventListener('hashchange', go)
    return () => window.removeEventListener('hashchange', go)
  }, [])
  // 비어 있으면 노란 테두리 (쓰는 대로 사라짐 · 다시 지우면 다시)
  const missing = (key: ProfileField, value: string) => (need.includes(key) && !value.trim() ? '' : undefined)
  const onInput = (e: React.FormEvent<HTMLFormElement>) => {
    const el = e.target as HTMLInputElement
    if (el.name === 'bank_account') setAcct(el.value)
    if (!PROFILE_FIELDS.includes(el.name as ProfileField) || !need.includes(el.name as ProfileField)) return
    if (el.value.trim()) el.removeAttribute('data-missing')
    else el.setAttribute('data-missing', '')
  }
  return (
    <form id="profile-form" ref={ref} action={action} onReset={keepInputs} onInput={onInput} className="card space-y-3">
      {/* 계좌·주소를 고친 뒤 '저장'을 잊고 나가지 않게: 아래 탭 위에 저장 바 */}
      <UnsavedBar formId="profile-form" state={state} />
      <h2 className="font-bold">급여 계좌 · 연락 정보</h2>
      <div className="grid grid-cols-[1fr_1.2fr] gap-3">
        <div className="min-w-0">
          <label className="label" htmlFor="bank_name">
            은행
          </label>
          <select id="bank_name" name="bank_name" className="input" defaultValue={initial.bank_name}>
            <option value="">은행 선택</option>
            {BANKS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="bank_account">
            계좌번호
          </label>
          <input
            id="bank_account"
            name="bank_account"
            className="input scroll-mt-24"
            inputMode="numeric"
            placeholder="숫자만"
            defaultValue={initial.bank_account}
            onPaste={onAccountPaste}
            data-missing={missing('bank_account', initial.bank_account)}
          />
        </div>
      </div>
      {/* 계좌번호: 쓰는 대로 몇 자리인지 (10~16자리면 ✓) */}
      <div className="-mt-2">
        <AccountDigits value={acct} fallback="계좌번호는 숫자 10~16자리 · 본인 명의 계좌가 가장 빨라요" />
      </div>
      {/* 예금주·비상연락처는 두 칸으로 (위아래로 덜 길게) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className="label" htmlFor="account_holder">
            예금주
          </label>
          <input id="account_holder" name="account_holder" className="input" placeholder="비우면 본인 이름" defaultValue={initial.account_holder} />
        </div>
        <div className="min-w-0">
          <label className="label whitespace-nowrap" htmlFor="emergency_phone">
            비상연락처 <span className="font-normal text-mute">(선택)</span>
          </label>
          <input
            id="emergency_phone"
            name="emergency_phone"
            className="input"
            inputMode="tel"
            placeholder="가족 번호"
            onInput={onPhoneInput}
            title="현장에서 연락이 안 될 때 담당자가 걸어요"
            defaultValue={phoneShown(initial.emergency_phone)}
            data-missing={missing('emergency_phone', initial.emergency_phone)}
          />
        </div>
      </div>
      {ownName && <HolderHint ownName={ownName} />}
      <div>
        <label className="label" htmlFor="address">
          주소
        </label>
        <input id="address" name="address" className="input" placeholder="예) 진주시 남강로 123" defaultValue={initial.address} data-missing={missing('address', initial.address)} />
      </div>
      <FormMessage state={state} />
      <SubmitButton>저장</SubmitButton>
    </form>
  )
}

export function PinForm() {
  const [state, action] = useActionState(changePin, null)
  return (
    <Fold title="비밀번호 변경" summary="숫자 6자리 비밀번호 바꾸기">
      <form action={action} onReset={keepInputs} className="space-y-3">
        <input name="current" type="password" inputMode="numeric" maxLength={6} className="input" placeholder="현재 비밀번호" required />
        <div className="grid grid-cols-2 gap-3">
          <input name="pin" type="password" inputMode="numeric" maxLength={6} className="input" placeholder="새 비밀번호 6자리" required />
          <input name="pin2" type="password" inputMode="numeric" maxLength={6} className="input" placeholder="새 비밀번호 확인" required />
        </div>
        <FormMessage state={state} />
        <SubmitButton className="btn-soft">변경</SubmitButton>
      </form>
    </Fold>
  )
}

export function WithdrawForm() {
  const [state, action] = useActionState(withdraw, null)
  return (
    <Fold title="회원 탈퇴" summary="계정 삭제 · 근무 기록은 법에 따라 3년 보관">
      <form action={action} onReset={keepInputs} className="space-y-3">
        <p className="text-sm text-sub">
          근무 기록이 없으면 정보가 바로 지워져요. 근무 기록이 있으면 근로기준법에 따라 근로계약서·임금 기록을 3년 동안 보관한 뒤 지우고,
          계정은 바로 쓸 수 없게 돼요.
        </p>
        <input name="pin" type="password" inputMode="numeric" maxLength={6} className="input" placeholder="비밀번호 확인" required />
        <FormMessage state={state} />
        <SubmitButton className="btn-danger">탈퇴하기</SubmitButton>
      </form>
    </Fold>
  )
}
