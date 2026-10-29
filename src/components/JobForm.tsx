'use client'

import { useActionState, useRef, useState } from 'react'
import { saveJob } from '@/app/actions/admin'
import { won } from '@/lib/format'
import { estimateDay, MIN_WAGE_2026, type PayRule } from '@/lib/pay'
import { minutesText } from '@/lib/time'
import type { Job } from '@/lib/types'
import { FormMessage, SubmitButton } from './ui'

type Tpl = { id: string; title: string; kind: string; is_default: boolean }

function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
      <span className="text-sm">
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-xs text-mute">{hint}</span>}
      </span>
    </label>
  )
}

function preview(form: HTMLFormElement | null) {
  if (!form) return null
  const f = new FormData(form)
  const g = (k: string) => String(f.get(k) ?? '')
  const n = (k: string) => Number(g(k).replace(/,/g, '')) || 0
  if (!g('start_time') || !g('end_time')) return null
  const rule: PayRule & Pick<Job, 'start_date' | 'start_time' | 'end_time'> = {
    pay_type: g('pay_type') === 'daily' ? 'daily' : 'hourly',
    hourly_wage: n('hourly_wage'),
    daily_wage: n('daily_wage'),
    break_mode: (g('break_mode') as Job['break_mode']) || 'auto',
    break_minutes: n('break_minutes'),
    round_unit: n('round_unit') || 1,
    early_clamp: f.get('early_clamp') === 'on',
    premium_enabled: f.get('premium_enabled') === 'on',
    allowance: n('allowance'),
    tax_type: 'none',
    employment_insurance: false,
    start_date: g('start_date') || '2026-01-01',
    start_time: g('start_time'),
    end_time: g('end_time'),
  }
  return estimateDay(rule)
}

export default function JobForm({
  job,
  templates,
  defaults,
}: {
  job: Job | null
  templates: Tpl[]
  defaults: { hourly_wage: number; premium: boolean }
}) {
  const [state, action] = useActionState(saveJob.bind(null, job?.id ?? null), null)
  const formRef = useRef<HTMLFormElement>(null)
  const [est, setEst] = useState(() => (job ? estimateDay(job) : null))
  const [payType, setPayType] = useState(job?.pay_type ?? 'hourly')
  const [breakMode, setBreakMode] = useState(job?.break_mode ?? 'auto')
  const [taxType, setTaxType] = useState(job?.tax_type ?? 'daily')
  const [locMsg, setLocMsg] = useState('')
  const latRef = useRef<HTMLInputElement>(null)
  const lngRef = useRef<HTMLInputElement>(null)

  const pasteCoords = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const m = e.clipboardData.getData('text').match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/)
    if (m) {
      e.preventDefault()
      latRef.current!.value = m[1]
      lngRef.current!.value = m[2]
    }
  }

  return (
    <form ref={formRef} action={action} onChange={() => setEst(preview(formRef.current))} className="space-y-5">
      <section className="card space-y-4">
        <h2 className="font-bold">기본 정보</h2>
        <Field label="공고 제목 *">
          <input name="title" className="input" defaultValue={job?.title} placeholder="예) 진주남강유등축제 안내·질서 스태프" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="행사명">
            <input name="event_name" className="input" defaultValue={job?.event_name ?? ''} placeholder="2026 진주남강유등축제" />
          </Field>
          <Field label="업무내용" hint="근로계약서 '업무내용'에 들어갑니다.">
            <input name="task" className="input" defaultValue={job?.task ?? ''} placeholder="관람객 안내, 동선 통제, 부스 운영 보조" />
          </Field>
        </div>
        <Field label="상세 설명">
          <textarea name="description" rows={4} className="input" defaultValue={job?.description ?? ''} placeholder="근무자에게 알릴 내용 (식사 제공, 우천 시 안내 등)" />
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">일정 · 인원</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Field label="시작일 *">
            <input type="date" name="start_date" className="input" defaultValue={job?.start_date} required />
          </Field>
          <Field label="종료일" hint="하루짜리면 비워 두세요">
            <input type="date" name="end_date" className="input" defaultValue={job && job.end_date !== job.start_date ? job.end_date : ''} />
          </Field>
          <Field label="시작 시각 *">
            <input type="time" name="start_time" className="input" defaultValue={job?.start_time.slice(0, 5) ?? '09:00'} required />
          </Field>
          <Field label="종료 시각 *" hint="시작보다 이르면 다음날">
            <input type="time" name="end_time" className="input" defaultValue={job?.end_time.slice(0, 5) ?? '18:00'} required />
          </Field>
          <Field label="모집 인원 *">
            <input type="number" name="headcount" min={1} className="input" defaultValue={job?.headcount ?? 10} required />
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">장소 · 출퇴근 위치 확인</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="장소명">
            <input name="location_name" className="input" defaultValue={job?.location_name ?? ''} placeholder="진주성 일원" />
          </Field>
          <Field label="주소" className="sm:col-span-2">
            <input name="address" className="input" defaultValue={job?.address ?? ''} placeholder="경남 진주시 남강로 626" />
          </Field>
        </div>
        <Field label="집결 장소 · 시간">
          <input name="meeting_point" className="input" defaultValue={job?.meeting_point ?? ''} placeholder="08:40 촉석문 앞 운영본부 천막" />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="위도">
            <input ref={latRef} name="lat" className="input" inputMode="decimal" defaultValue={job?.lat ?? ''} onPaste={pasteCoords} placeholder="35.1890" />
          </Field>
          <Field label="경도">
            <input ref={lngRef} name="lng" className="input" inputMode="decimal" defaultValue={job?.lng ?? ''} onPaste={pasteCoords} placeholder="128.0814" />
          </Field>
          <Field label="허용 반경(m)">
            <input type="number" name="gps_radius_m" className="input" defaultValue={job?.gps_radius_m ?? 300} min={50} max={5000} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className="btn-soft w-full"
              onClick={() => {
                setLocMsg('위치 확인 중…')
                navigator.geolocation?.getCurrentPosition(
                  (p) => {
                    latRef.current!.value = p.coords.latitude.toFixed(6)
                    lngRef.current!.value = p.coords.longitude.toFixed(6)
                    setLocMsg('현재 위치를 넣었습니다.')
                  },
                  () => setLocMsg('위치를 가져오지 못했습니다. 권한을 확인해 주세요.'),
                  { enableHighAccuracy: true, timeout: 10_000 },
                )
              }}
            >
              현재 위치로
            </button>
          </div>
        </div>
        <p className="hint">
          {locMsg || '구글 지도에서 행사장을 오른쪽 클릭하면 나오는 좌표(예: 35.1890, 128.0814)를 위도 칸에 붙여넣으면 두 칸이 한 번에 채워집니다.'}
        </p>
        <Check
          name="gps_required"
          label="현장에서만 근무 시작 가능"
          defaultChecked={job?.gps_required}
          hint="근무 시작 버튼을 누를 때 휴대폰 위치가 허용 반경 안이어야 합니다. 꺼 두면 위치만 기록합니다."
        />
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">급여</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="급여 형태">
            <select name="pay_type" className="input" value={payType} onChange={(e) => setPayType(e.target.value as Job['pay_type'])}>
              <option value="hourly">시급제</option>
              <option value="daily">일급제</option>
            </select>
          </Field>
          <Field label="시급(원)" hint={`2026년 최저 ${MIN_WAGE_2026.toLocaleString()}원`} className={payType === 'hourly' ? '' : 'hidden'}>
            <input type="number" name="hourly_wage" className="input" defaultValue={job?.hourly_wage ?? defaults.hourly_wage} step={10} />
          </Field>
          <Field label="일급(원)" className={payType === 'daily' ? '' : 'hidden'}>
            <input type="number" name="daily_wage" className="input" defaultValue={job?.daily_wage || 100_000} step={1000} />
          </Field>
          <Field label="휴게시간" hint={breakMode === 'auto' ? '4시간 이상 30분, 8시간 이상 1시간' : undefined}>
            <select name="break_mode" className="input" value={breakMode} onChange={(e) => setBreakMode(e.target.value as Job['break_mode'])}>
              <option value="auto">법정 자동</option>
              <option value="fixed">직접 지정</option>
              <option value="none">없음</option>
            </select>
          </Field>
          {breakMode === 'fixed' ? (
            <Field label="휴게(분)">
              <input type="number" name="break_minutes" className="input" defaultValue={job?.break_minutes || 60} min={0} max={240} step={10} />
            </Field>
          ) : (
            <Field label="근무시간 절사" hint="단위 미만은 버림 (1분이면 그대로)">
              <select name="round_unit" className="input" defaultValue={job?.round_unit ?? 1}>
                <option value={1}>1분 단위</option>
                <option value={10}>10분 단위</option>
                <option value={15}>15분 단위</option>
                <option value={30}>30분 단위</option>
              </select>
            </Field>
          )}
        </div>
        {breakMode === 'fixed' && (
          <Field label="근무시간 절사" hint="단위 미만은 버림 (1분이면 그대로)" className="sm:w-1/4">
            <select name="round_unit" className="input" defaultValue={job?.round_unit ?? 1}>
              <option value={1}>1분 단위</option>
              <option value={10}>10분 단위</option>
              <option value={15}>15분 단위</option>
              <option value={30}>30분 단위</option>
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="1일 수당(원)" hint="교통비·식대 등, 출근한 날마다">
            <input type="number" name="allowance" className="input" defaultValue={job?.allowance ?? 0} min={0} step={1000} />
          </Field>
          <Field label="수당 이름">
            <input name="allowance_label" className="input" defaultValue={job?.allowance_label ?? '교통비'} />
          </Field>
          <Field label="지급일 안내" className="col-span-2">
            <input name="pay_day" className="input" defaultValue={job?.pay_day ?? ''} placeholder="행사 종료 후 7일 이내 계좌 입금" />
          </Field>
        </div>
        <Check
          name="early_clamp"
          label="시작 시각 전에 누른 출근은 공고 시작 시각부터 인정"
          defaultChecked={job?.early_clamp}
          hint="일찍 도착해 버튼을 누른 시간을 근무로 치지 않습니다. 사전 교육·준비를 지시했다면 끄거나 해당 근무를 보정하세요."
        />
        <Check
          name="premium_enabled"
          label="연장·야간 가산수당 50% 적용 (상시 5인 이상 사업장)"
          defaultChecked={job ? job.premium_enabled : defaults.premium}
          hint="하루 8시간을 넘긴 시간과 22시~06시 근무시간에 시급의 50%를 더 줍니다. 시급제에만 적용됩니다."
        />
        {est && (
          <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
            공고 시간대로 일하면 하루 <b className="text-base">{won(est.gross)}</b> (휴게 {est.breakMin}분 제외 {minutesText(est.paidMin)}
            {est.overtimePay ? `, 연장 ${won(est.overtimePay)}` : ''}
            {est.nightPay ? `, 야간 ${won(est.nightPay)}` : ''}) · 세전
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">세금 · 보험 공제</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ['daily', '일용근로소득', '일급 15만원까지 비과세, 초과분 2.7% + 지방세. 근로계약 시 원칙'],
              ['business', '사업소득 3.3%', '프리랜서(용역) 계약일 때만'],
              ['none', '공제 없음', '세전 금액 그대로 지급'],
            ] as const
          ).map(([v, t, d]) => (
            <label key={v} className={`cursor-pointer rounded-xl border-2 px-4 py-3 ${taxType === v ? 'border-brand-500 bg-brand-50' : 'border-line'}`}>
              <input type="radio" name="tax_type" value={v} checked={taxType === v} onChange={() => setTaxType(v)} className="sr-only" />
              <span className="block font-semibold">{t}</span>
              <span className="text-xs text-sub">{d}</span>
            </label>
          ))}
        </div>
        {taxType === 'daily' && (
          <Check
            name="employment_insurance"
            label="고용보험 근로자 부담분 0.9% 공제"
            defaultChecked={job ? job.employment_insurance : true}
            hint="일용근로자도 고용보험 가입 대상입니다 (월 근로내용확인신고)."
          />
        )}
        {taxType === 'business' && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
            근로계약서를 쓰고 출퇴근·업무 지시를 받는 근무자는 일반적으로 근로자로 봅니다. 3.3% 사업소득 처리는 실제 용역 계약일 때만 쓰세요.
          </p>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">근무 안내</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="복장">
            <input name="dress_code" className="input" defaultValue={job?.dress_code ?? ''} placeholder="검정 바지, 운동화 (상의 스태프 티 지급)" />
          </Field>
          <Field label="준비물">
            <input name="supplies" className="input" defaultValue={job?.supplies ?? ''} placeholder="신분증, 보조배터리" />
          </Field>
          <Field label="현장 담당자">
            <input name="manager_name" className="input" defaultValue={job?.manager_name ?? ''} />
          </Field>
          <Field label="담당자 연락처">
            <input name="manager_phone" className="input" inputMode="tel" defaultValue={job?.manager_phone ?? ''} />
          </Field>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">확정 후 서명받을 서류</h2>
        {templates.length === 0 && <p className="text-sm text-mute">등록된 서식이 없습니다. 서류 서식 메뉴에서 기본 서식을 불러오세요.</p>}
        {templates.map((t) => (
          <Check
            key={t.id}
            name="required_docs"
            label={t.title}
            defaultChecked={job ? job.required_docs.includes(t.id) : t.is_default}
          />
        ))}
        <p className="hint">체크한 서류에 서명해야 근무 시작 버튼이 열립니다. 근로계약서는 근로기준법 제17조에 따라 꼭 서면(전자문서)으로 주어야 합니다.</p>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">공개 설정</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="상태">
            <select name="status" className="input" defaultValue={job?.status ?? 'open'}>
              <option value="open">모집중 (목록에 공개)</option>
              <option value="closed">모집마감 (목록에 보이되 지원 불가)</option>
              <option value="draft">임시저장 (비공개)</option>
              <option value="done">종료</option>
            </select>
          </Field>
        </div>
        <Check name="auto_approve" label="지원하면 바로 확정 (모집 인원까지)" defaultChecked={job?.auto_approve} hint="끄면 관리자가 지원자를 보고 확정합니다." />
      </section>

      <div className="sticky bottom-3 z-10">
        <FormMessage state={state} />
        <SubmitButton className="btn-primary mt-2 w-full py-3.5 text-base shadow-lg" pendingText="저장 중…">
          {job ? '공고 저장' : '공고 등록'}
        </SubmitButton>
      </div>
    </form>
  )
}
