'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import {
  changePin,
  clockIn,
  clockOut,
  signDocument,
  updateProfile,
  withdraw,
  type ClockResult,
} from '@/app/actions/worker'
import { BANKS } from '@/lib/privacy'
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

export function ClockPanel({
  jobId,
  open,
  useLocation,
  gpsRequired = false,
}: {
  jobId: string
  open: { id: string; clock_in: string; startText: string } | null
  useLocation: boolean
  /** 현장 반경 안에서만 근무 시작 가능 */
  gpsRequired?: boolean
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ClockResult | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [step, setStep] = useState('')
  // 시작 직후 같은 자리의 버튼이 '근무 종료'로 바뀌므로, 두 번 눌러야 종료되게 해서 실수를 막음
  const [confirmOut, setConfirmOut] = useState(false)
  const [celebrate, setCelebrate] = useState(0)
  const [geo, setGeo] = useState<GeoProblem | null>(null)

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
      let pos: { lat: number; lng: number } | null = null
      if (useLocation) {
        setStep('위치 확인 중…')
        const r = await getPosition()
        pos = r.pos
        setGeo(r.problem)
      }
      setStep('기록 중…')
      const res = open ? await clockOut(open.id, pos?.lat ?? null, pos?.lng ?? null) : await clockIn(jobId, pos?.lat ?? null, pos?.lng ?? null)
      setResult(res)
      setStep('')
      setNow(Date.now())
      if (res.ok) {
        const id = Date.now()
        setCelebrate(id)
        setTimeout(() => setCelebrate((c) => (c === id ? 0 : c)), 1500)
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
      {useLocation && !result && !geo && <p className="text-center text-xs text-mute">버튼을 누르면 현장 위치를 함께 기록합니다.</p>}
      <FormMessage state={result} />
      {useLocation && geo && !pending && <LocationHelp problem={geo} required={gpsRequired && !open} />}
    </div>
  )
}

export function SignaturePad({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

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
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-44 w-full touch-none rounded-xl border-2 border-dashed border-line bg-white"
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
          }}
        />
        {empty ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-mute">여기에 서명해 주세요</span>
        ) : (
          <span className="badge pointer-events-none absolute top-2 right-2 animate-pop bg-emerald-50 text-emerald-700">서명됨 ✓</span>
        )}
      </div>
      <div className="mt-2 flex justify-end">
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

export function SignForm({ docId, title }: { docId: string; title: string }) {
  const [state, action] = useActionState(signDocument.bind(null, docId), null)
  return (
    <form action={action} onReset={keepInputs} className="card no-print space-y-4">
      <h2 className="font-bold">근로자 서명</h2>
      <SignaturePad name="signature" />
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

export function ProfileForm({
  initial,
}: {
  initial: { address: string; emergency_phone: string; bank_name: string; bank_account: string; account_holder: string }
}) {
  const [state, action] = useActionState(updateProfile, null)
  return (
    <form action={action} onReset={keepInputs} className="card space-y-4">
      <h2 className="font-bold">급여 계좌 · 연락 정보</h2>
      <div className="grid grid-cols-[1fr_1.2fr] gap-3">
        <select name="bank_name" className="input" defaultValue={initial.bank_name}>
          <option value="">은행 선택</option>
          {BANKS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <input name="bank_account" className="input" inputMode="numeric" placeholder="계좌번호" defaultValue={initial.bank_account} />
      </div>
      <input name="account_holder" className="input" placeholder="예금주 (비우면 본인 이름)" defaultValue={initial.account_holder} />
      <input name="address" className="input" placeholder="주소" defaultValue={initial.address} />
      <input name="emergency_phone" className="input" inputMode="tel" placeholder="비상연락처 (선택)" defaultValue={initial.emergency_phone} />
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
          근무 기록이 없으면 정보가 즉시 삭제됩니다. 근무 기록이 있으면 근로기준법에 따라 근로계약서·임금 기록을 3년간 보관한 뒤 파기하며,
          계정은 바로 사용할 수 없게 됩니다.
        </p>
        <input name="pin" type="password" inputMode="numeric" maxLength={6} className="input" placeholder="비밀번호 확인" required />
        <FormMessage state={state} />
        <SubmitButton className="btn-danger">탈퇴하기</SubmitButton>
      </form>
    </Fold>
  )
}
