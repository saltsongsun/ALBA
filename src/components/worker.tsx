'use client'

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
  signDocument,
  updateProfile,
  withdraw,
  type ClockResult,
} from '@/app/actions/worker'
import { BANKS } from '@/lib/privacy'
import AccountDigits from './AccountDigits'
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
function LocationHelp({ problem, required }: { problem: GeoProblem; required: boolean }) {
  const [env, setEnv] = useState<'kakao' | 'ios' | 'android' | 'other'>('other')
  useEffect(() => {
    const ua = navigator.userAgent
    setEnv(/KAKAOTALK/i.test(ua) ? 'kakao' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other')
  }, [])
  return (
    <div role="status" className="animate-pop space-y-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-bold">📍 {problem === 'denied' ? '위치 권한이 꺼져 있어요' : '위치를 찾지 못했어요'}</p>
      <p>{required ? '이 행사는 현장에서만 근무 시작을 누를 수 있어요.' : '위치 없이도 기록되지만, 켜 두면 현장 확인이 정확해요.'}</p>
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
    <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
      <span aria-hidden>⚠️</span> 시작 시각({startText})이 {diff === 0 ? '됐어요' : `${span(-diff)} 지났어요`}. 도착했다면 근무 시작을 눌러 주세요.
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
}: {
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
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ClockResult | null>(null)
  const [now, setNow] = useState(() => serverNow ?? Date.now())
  const [step, setStep] = useState('')
  // 시작 직후 같은 자리의 버튼이 '근무 종료'로 바뀌므로, 두 번 눌러야 종료되게 해서 실수를 막음
  const [confirmOut, setConfirmOut] = useState(false)
  const [celebrate, setCelebrate] = useState(0)
  const [geo, setGeo] = useState<GeoProblem | null>(null)
  // 인터넷이 끊겨 기록하지 못했으면 연결되는 대로 다시 시도 (지하 행사장 등)
  const [offline, setOffline] = useState(false)
  const lastPos = useRef<{ lat: number; lng: number } | null>(null)
  const [asked, setAsked] = useState<ClockResult | null>(null)
  const [asking, startAsk] = useTransition()

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
    setConfirmOut(false)
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

  return (
    <div className="relative space-y-3">
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
      <button
        type="button"
        onClick={press}
        disabled={pending}
        className={`w-full rounded-2xl py-5 text-xl font-extrabold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${
          !open
            ? 'bg-emerald-500 shadow-emerald-200 hover:bg-emerald-600'
            : confirmOut
              ? 'bg-rose-700 shadow-rose-300'
              : 'bg-rose-500 shadow-rose-200 hover:bg-rose-600'
        }`}
      >
        {pending ? step || '처리 중…' : !open ? '근무 시작' : confirmOut ? '한 번 더 누르면 종료' : '근무 종료'}
      </button>
      {confirmOut && !pending && <p className="text-center text-sm font-semibold text-rose-600">실수로 끝나지 않도록 한 번 더 눌러야 종료돼요.</p>}
      {useLocation && !result && !geo && <p className="text-center text-xs text-mute">버튼을 누르면 현장 위치도 함께 기록돼요.</p>}
      <FormMessage state={result} />
      {offline && !pending && (
        <button type="button" onClick={run} className="btn-gray btn-sm w-full">
          지금 다시 시도
        </button>
      )}
      {result?.gps && !open && !pending && (
        <div className="animate-pop space-y-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-100">
          <p className="font-bold">현장에 도착했는데 위치가 안 맞나요?</p>
          <p>실내나 지하에서는 위치가 멀게 잡힐 수 있어요. 담당자에게 요청하면 지금 시각으로 출근 처리해 줘요.</p>
          {asked?.ok ? (
            <p className="font-semibold text-emerald-700">✓ {asked.ok}</p>
          ) : (
            <button type="button" onClick={ask} disabled={asking} className="btn-primary btn-sm disabled:opacity-60">
              {asking ? '요청 중…' : '담당자에게 출근 확인 요청'}
            </button>
          )}
          {asked?.error && <p className="font-semibold text-rose-600">{asked.error}</p>}
        </div>
      )}
      {useLocation && geo && !pending && <LocationHelp problem={geo} required={gpsRequired && !open} />}
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
export function FixRequest({
  attendanceId,
  inText,
  outText,
  sent,
}: {
  attendanceId: string
  inText: string
  outText: string
  /** 보내 놓고 아직 답을 못 받은 요청 */
  sent: { field: 'in' | 'out'; time: string; at: string } | null
}) {
  const [state, action] = useActionState(requestFix.bind(null, attendanceId), null)
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<'in' | 'out'>('out')
  const done = state?.ok
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
        <button type="button" onClick={() => setOpen(true)} className="w-full text-center text-sm font-semibold text-sub underline underline-offset-4">
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
                <input type="radio" name="field" value={v} checked={field === v} onChange={() => setField(v)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          <label className="block">
            <span className="label">실제 {field === 'in' ? '출근' : '종료'} 시각</span>
            <input key={field} type="time" name="time" defaultValue={field === 'in' ? inText : outText} required className="input bg-white" />
          </label>
          <input name="reason" maxLength={100} className="input bg-white text-sm" placeholder="사유 (선택) 예: 실수로 종료를 일찍 눌렀어요" />
          <FormMessage state={state} />
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-gray">
              취소
            </button>
            <SubmitButton className="btn-primary" pendingText="보내는 중…">
              정정 요청 보내기
            </SubmitButton>
          </div>
          <p className="hint">담당자가 확인하고 고쳐 주면 알림이 와요. 직접 고칠 수는 없어요.</p>
        </form>
      )}
    </div>
  )
}

/** 늦을 것 같을 때 담당자에게 몇 분 늦는지 알리기 (오늘 근무 카드, 출근 전) */
export function LateNotice({ jobId, sent }: { jobId: string; sent: { minutes: number; eta: string; at: string } | null }) {
  const [state, action, pending] = useActionState(notifyLate.bind(null, jobId), null)
  const [openForm, setOpenForm] = useState(false)
  const [minutes, setMinutes] = useState(sent?.minutes ?? 10)
  const done = state?.ok
  useEffect(() => {
    if (done) setOpenForm(false)
  }, [done])
  return (
    <div className="space-y-2">
      {sent && !state && (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          🕒 {sent.at}에 담당자에게 <b>약 {sent.minutes}분 늦음</b>(도착 예정 {sent.eta})을 알렸어요.
        </p>
      )}
      {!openForm ? (
        <button type="button" onClick={() => setOpenForm(true)} className="btn-gray btn-sm w-full">
          🕒 {sent || done ? '늦는 시간 다시 알리기' : '늦을 것 같아요 · 담당자에게 알리기'}
        </button>
      ) : (
        <form action={action} className="animate-pop space-y-3 rounded-xl bg-bg p-3.5">
          <p className="text-sm font-bold">얼마나 늦을 것 같나요?</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[10, 20, 30, 60].map((m) => (
              <label
                key={m}
                className={`cursor-pointer rounded-xl py-2.5 text-center text-sm font-bold ring-1 transition active:scale-95 ${
                  minutes === m ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-sub ring-line'
                }`}
              >
                <input type="radio" name="minutes" value={m} checked={minutes === m} onChange={() => setMinutes(m)} className="sr-only" />
                {m === 60 ? '1시간' : `${m}분`}
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
    <div data-sign-pad data-invalid={invalid && empty ? '' : undefined}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className={`h-44 w-full touch-none rounded-xl border-2 border-dashed bg-white transition-colors ${invalid && empty ? 'border-rose-400' : 'border-line'}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = true
            const ctx = e.currentTarget.getContext('2d')!
            const p = point(e)
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p.x + 0.1, p.y + 0.1)
            ctx.stroke()
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return
            const ctx = e.currentTarget.getContext('2d')!
            const p = point(e)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
          }}
          onPointerUp={() => {
            if (!drawing.current) return
            drawing.current = false
            setEmpty(false)
            exportImage()
            onDrawn?.()
          }}
        />
        {empty ? (
          <span className={`pointer-events-none absolute inset-0 grid place-items-center ${invalid ? 'font-semibold text-rose-600' : 'text-mute'}`}>
            {invalid ? '손가락으로 여기에 서명해 주세요' : '여기에 서명해 주세요'}
          </span>
        ) : (
          <span className="badge pointer-events-none absolute top-2 right-2 animate-pop bg-emerald-50 text-emerald-700">서명됨 ✓</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
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
        try {
          sessionStorage.setItem(LAST_SIGNATURE, JSON.stringify({ u: userId, at: Date.now(), data: sig }))
        } catch {}
      }}
      id="sign"
      className="card no-print scroll-mt-20 space-y-4"
    >
      <h2 className="font-bold">근로자 서명</h2>
      <SignaturePad name="signature" reuse={saved} invalid={needSign} onDrawn={() => setNeedSign(false)} />
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="agree" className="mt-0.5 size-5 accent-brand-600" required />
        <span>위 「{title}」 내용을 모두 읽고 이해했으며, 전자서명으로 체결(제출)하는 데 동의합니다.</span>
      </label>
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
}: {
  initial: { address: string; emergency_phone: string; bank_name: string; bank_account: string; account_holder: string }
  need?: ProfileField[]
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
    <form id="profile-form" ref={ref} action={action} onReset={keepInputs} onInput={onInput} className="card space-y-4">
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
            data-missing={missing('bank_account', initial.bank_account)}
          />
        </div>
      </div>
      {/* 계좌번호: 쓰는 대로 몇 자리인지 (10~16자리면 ✓) */}
      <div className="-mt-2">
        <AccountDigits value={acct} fallback="계좌번호는 숫자 10~16자리 · 본인 명의 계좌가 가장 빨라요" />
      </div>
      <div>
        <label className="label" htmlFor="account_holder">
          예금주
        </label>
        <input id="account_holder" name="account_holder" className="input" placeholder="비우면 본인 이름" defaultValue={initial.account_holder} />
      </div>
      <div>
        <label className="label" htmlFor="address">
          주소
        </label>
        <input id="address" name="address" className="input" placeholder="예) 진주시 남강로 123" defaultValue={initial.address} data-missing={missing('address', initial.address)} />
      </div>
      <div>
        <label className="label" htmlFor="emergency_phone">
          비상연락처 <span className="font-normal text-mute">(선택)</span>
        </label>
        <input
          id="emergency_phone"
          name="emergency_phone"
          className="input"
          inputMode="tel"
          placeholder="가족 등 (현장에서 연락이 안 될 때)"
          defaultValue={initial.emergency_phone}
          data-missing={missing('emergency_phone', initial.emergency_phone)}
        />
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
