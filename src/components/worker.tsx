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
import { FormMessage, SubmitButton } from './ui'

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

function elapsedText(fromIso: string, now: number): string {
  const min = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000))
  const h = Math.floor(min / 60)
  return h ? `${h}시간 ${min % 60}분` : `${min}분`
}

export function ClockPanel({
  jobId,
  open,
  useLocation,
}: {
  jobId: string
  open: { id: string; clock_in: string; startText: string } | null
  useLocation: boolean
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ClockResult | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [step, setStep] = useState('')

  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [open])

  const run = () =>
    start(async () => {
      setResult(null)
      let pos: { lat: number; lng: number } | null = null
      if (useLocation) {
        setStep('위치 확인 중…')
        pos = await getPosition()
      }
      setStep('기록 중…')
      const res = open ? await clockOut(open.id, pos?.lat ?? null, pos?.lng ?? null) : await clockIn(jobId, pos?.lat ?? null, pos?.lng ?? null)
      setResult(res)
      setStep('')
      setNow(Date.now())
    })

  return (
    <div className="space-y-3">
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
        onClick={run}
        disabled={pending}
        className={`w-full rounded-2xl py-5 text-xl font-extrabold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${
          open ? 'bg-rose-500 shadow-rose-200 hover:bg-rose-600' : 'bg-emerald-500 shadow-emerald-200 hover:bg-emerald-600'
        }`}
      >
        {pending ? step || '처리 중…' : open ? '근무 종료' : '근무 시작'}
      </button>
      {useLocation && !result && <p className="text-center text-xs text-mute">버튼을 누르면 현장 위치를 함께 기록합니다.</p>}
      <FormMessage state={result} />
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
        {empty && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-mute">여기에 서명해 주세요</span>
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
    <form action={action} className="card no-print space-y-4">
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
    <form action={action} className="card space-y-4">
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
    <form action={action} className="card space-y-3">
      <h2 className="font-bold">비밀번호 변경</h2>
      <input name="current" type="password" inputMode="numeric" maxLength={6} className="input" placeholder="현재 비밀번호" required />
      <div className="grid grid-cols-2 gap-3">
        <input name="pin" type="password" inputMode="numeric" maxLength={6} className="input" placeholder="새 비밀번호 6자리" required />
        <input name="pin2" type="password" inputMode="numeric" maxLength={6} className="input" placeholder="새 비밀번호 확인" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-soft">변경</SubmitButton>
    </form>
  )
}

export function WithdrawForm() {
  const [state, action] = useActionState(withdraw, null)
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-bold">회원 탈퇴</h2>
      <p className="text-sm text-sub">
        근무 기록이 없으면 정보가 즉시 삭제됩니다. 근무 기록이 있으면 근로기준법에 따라 근로계약서·임금 기록을 3년간 보관한 뒤 파기하며,
        계정은 바로 사용할 수 없게 됩니다.
      </p>
      <input name="pin" type="password" inputMode="numeric" maxLength={6} className="input" placeholder="비밀번호 확인" required />
      <FormMessage state={state} />
      <SubmitButton className="btn-danger">탈퇴하기</SubmitButton>
    </form>
  )
}
