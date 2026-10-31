'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { saveJob } from '@/app/actions/admin'
import { won } from '@/lib/format'
import { estimateDay, MIN_WAGE_2026, type PayRule } from '@/lib/pay'
import { fmtDate, minutesText } from '@/lib/time'
import { JOB_FIELDS } from '@/lib/jobFields'
import { mapLinks } from '@/lib/map'
import type { Job, JobCondition } from '@/lib/types'
import Fold from './Fold'
import { FormMessage, keepInputs, SubmitButton } from './ui'

type Tpl = { id: string; title: string; kind: string; is_default: boolean }

// 자주 쓰는 근무 조건 (누르면 바로 한 줄 추가, 회색 글씨는 예시)
const CONDITION_PRESETS: { label: string; hint: string }[] = [
  { label: '휴게 시간', hint: '12:00~13:00 점심, 15:00 10분' },
  { label: '식사', hint: '점심 도시락 제공' },
  { label: '교통', hint: '셔틀버스 08:00 OO역 2번 출구' },
  { label: '주차', hint: '행사장 주차 가능 (무료)' },
  { label: '숙박', hint: '2인 1실 제공' },
  { label: '우천 시', hint: '취소되면 전날 문자로 안내' },
  { label: '우대', hint: '행사 스태프 경험자' },
  { label: '나이', hint: '만 18세 이상' },
]

type ConditionRow = JobCondition & { key: number; hint?: string }

/**
 * 공고에 보일 내용: 기본 항목(휴게·공제 등)은 켜고 끄고, 필요한 조건은 더하고 빼기.
 * 기본 항목을 끄면 공고 화면·홈 공고 카드·모집 문구에서 빠짐 (근로계약서에는 영향 없음)
 */
function PostingEditor({ initial, hidden }: { initial: JobCondition[]; hidden: string[] }) {
  const [shown, setShown] = useState(() => new Set<string>(JOB_FIELDS.map((f) => f.key).filter((k) => !hidden.includes(k))))
  const [rows, setRows] = useState<ConditionRow[]>(() => initial.map((c, i) => ({ ...c, key: i })))
  const nextKey = useRef(initial.length)
  const focusRef = useRef<string | null>(null)

  // 새 줄을 넣으면 바로 입력할 수 있게 (예시 조건은 내용 칸, 직접 추가는 이름 칸)
  useEffect(() => {
    if (!focusRef.current) return
    document.querySelector<HTMLInputElement>(focusRef.current)?.focus()
    focusRef.current = null
  }, [rows])

  const add = (label = '', hint = '') => {
    const key = nextKey.current++
    focusRef.current = `[data-cond="${key}-${label ? 'value' : 'label'}"]`
    setRows((r) => [...r, { key, label, value: '', hint }])
  }
  const change = (key: number, field: 'label' | 'value', v: string) => setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: v } : x)))
  const used = new Set(rows.map((r) => r.label.trim()))
  const saved = rows.map((r) => ({ label: r.label.trim(), value: r.value.trim() })).filter((c) => c.label && c.value)
  const toggle = (key: string, on: boolean) =>
    setShown((s) => {
      const next = new Set(s)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  // 법정 휴게 문구 대신 직접 쓰기: 기본 휴게를 끄고 '휴게 시간' 조건 줄로
  const writeBreak = () => {
    toggle('break', false)
    const existing = rows.find((r) => r.label.trim() === '휴게 시간')
    if (existing) document.querySelector<HTMLInputElement>(`[data-cond="${existing.key}-value"]`)?.focus()
    else add('휴게 시간', CONDITION_PRESETS[0].hint)
  }

  return (
    <Fold
      title="공고에 보일 내용"
      summary={[
        shown.size === JOB_FIELDS.length ? '기본 항목 모두 보임' : `기본 항목 ${JOB_FIELDS.length - shown.size}개 숨김`,
        saved.length ? `추가 조건 ${saved.map((c) => c.label).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <p className="hint">기본 항목은 켜고 끌 수 있고, 필요한 조건은 아래에 더하세요. 공고 화면과 단톡방 모집 문구에 그대로 나옵니다.</p>

      <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
        {JOB_FIELDS.map((f) => {
          const on = shown.has(f.key)
          return (
            <li key={f.key} className="flex items-center gap-3 px-3.5 py-2.5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" name="show_fields" value={f.key} checked={on} onChange={(e) => toggle(f.key, e.target.checked)} className="peer sr-only" />
                {/* 켜고 끄는 스위치 */}
                <span
                  aria-hidden
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 ${on ? 'bg-brand-600' : 'bg-line'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-4' : ''}`} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold transition-colors ${on ? 'text-ink' : 'text-mute line-through'}`}>{f.label}</span>
                  <span className="block text-xs text-mute">{f.hint}</span>
                </span>
              </label>
              {f.key === 'break' && (
                <button type="button" className="chip h-8 px-3 text-xs" onClick={writeBreak}>
                  직접 쓰기
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <p className="text-sm font-semibold text-sub">추가 조건</p>
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="flex animate-pop items-center gap-2">
              <input
                aria-label="조건 이름"
                data-cond={`${r.key}-label`}
                className="input w-24 shrink-0 py-2 text-sm font-semibold sm:w-32"
                value={r.label}
                maxLength={20}
                placeholder="조건"
                onChange={(e) => change(r.key, 'label', e.target.value)}
              />
              <input
                aria-label={`${r.label || '조건'} 내용`}
                data-cond={`${r.key}-value`}
                className="input flex-1 py-2 text-sm"
                value={r.value}
                maxLength={100}
                placeholder={r.hint || '내용'}
                onChange={(e) => change(r.key, 'value', e.target.value)}
              />
              <button
                type="button"
                aria-label={`${r.label || '조건'} 빼기`}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-rose-50 hover:text-rose-600 active:scale-90"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        {CONDITION_PRESETS.filter((p) => !used.has(p.label)).map((p) => (
          <button
            key={p.label}
            type="button"
            className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-sub transition hover:border-brand-500 hover:text-brand-700 active:scale-95"
            onClick={() => add(p.label, p.hint)}
          >
            ＋ {p.label}
          </button>
        ))}
        <button type="button" className="rounded-full bg-brand-50 px-3 py-1.5 text-[13px] font-semibold text-brand-700 transition active:scale-95" onClick={() => add()}>
          ＋ 직접 추가
        </button>
      </div>
      <input type="hidden" name="conditions" value={JSON.stringify(saved)} />
    </Fold>
  )
}

function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

function Check({ name, value, label, defaultChecked, hint }: { name: string; value?: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
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
  const [mapSrc, setMapSrc] = useState<string | null>(null)
  const latRef = useRef<HTMLInputElement>(null)
  const lngRef = useRef<HTMLInputElement>(null)
  // 접힌 칸 제목 옆 요약을 지금 입력값으로 (처음 그릴 때는 자리만 잡아 둠)
  const [fd, setFd] = useState<FormData | null>(null)
  const isNew = !job

  useEffect(() => {
    setFd(new FormData(formRef.current!))
    // 공고 화면의 '근로계약서 지정하기'처럼 #칸이름으로 들어오면 그 칸을 펼침
    const openHash = () => {
      const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)))
      if (el instanceof HTMLDetailsElement) {
        el.open = true
        el.scrollIntoView()
      }
    }
    openHash()
    window.addEventListener('hashchange', openHash)
    return () => window.removeEventListener('hashchange', openHash)
  }, [])

  const v = (k: string) => String(fd?.get(k) ?? '').trim()
  const brief = (text: string) => (fd ? text : '\u00a0')
  const contractMethod = (fd ? v('contract_method') : job?.contract_method) || 'app'
  const CONTRACT_TEXT: Record<string, string> = { app: '', paper: '종이', external: '다른 서비스' }
  const docTitles = templates
    .filter((t) => fd?.getAll('required_docs').includes(t.id) && (contractMethod === 'app' || t.kind !== 'contract'))
    .map((t) => t.title)
  const STATUS_TEXT: Record<string, string> = { open: '모집중', closed: '모집마감', draft: '임시저장', done: '종료', cancelled: '행사 취소' }

  const pasteCoords = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const m = e.clipboardData.getData('text').match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/)
    if (m) {
      e.preventDefault()
      latRef.current!.value = m[1]
      lngRef.current!.value = m[2]
    }
  }

  return (
    <form
      ref={formRef}
      action={action}
      onReset={keepInputs}
      onChange={() => {
        setEst(preview(formRef.current))
        setFd(new FormData(formRef.current!))
      }}
      // 접힌 칸에 빠진 필수 입력이 있으면 그 칸을 펼쳐서 바로 보이게
      onInvalidCapture={(e) => (e.target as HTMLElement).closest('details')?.setAttribute('open', '')}
      className="space-y-3"
    >
      <Fold title="기본 정보" open summary={brief(v('title') || '제목을 적어 주세요')}>
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
      </Fold>

      <Fold
        title="일정 · 인원"
        open={isNew}
        summary={brief(
          v('start_date')
            ? `${fmtDate(v('start_date'))}${v('end_date') && v('end_date') !== v('start_date') ? ` ~ ${fmtDate(v('end_date'))}` : ''} ${v('start_time')}~${v('end_time')} · ${v('headcount')}명`
            : '날짜를 정해 주세요',
        )}
      >
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
      </Fold>

      <Fold
        title="장소 · 출퇴근 위치 확인"
        open={isNew}
        summary={brief(
          [v('location_name') || v('address') || '장소 미입력', fd?.get('gps_required') ? '현장에서만 근무 시작' : '위치만 기록'].join(' · '),
        )}
      >
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
        {/* 넣은 주소·좌표가 맞는지 지도로 확인 (근무자 공고 화면에 나오는 지도와 같음) */}
        <div className="space-y-2">
          <button
            type="button"
            className="btn-gray btn-sm"
            onClick={() => {
              const f = formRef.current!
              const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value.trim()
              const lat = Number(v('lat'))
              const lng = Number(v('lng'))
              const point = v('lat') && v('lng') && Number.isFinite(lat) && Number.isFinite(lng)
              const links = mapLinks({ name: v('location_name') || null, address: v('address') || null, lat: point ? lat : null, lng: point ? lng : null })
              setMapSrc(links?.embed ?? null)
              if (!links) setLocMsg('장소 이름이나 주소를 먼저 넣어 주세요.')
            }}
          >
            지도로 확인
          </button>
          {mapSrc && <iframe title="행사장 지도 미리보기" src={mapSrc} loading="lazy" className="block h-56 w-full animate-pop rounded-xl border border-line bg-bg" />}
        </div>
        <Check
          name="gps_required"
          label="현장에서만 근무 시작 가능"
          defaultChecked={job?.gps_required}
          hint="근무 시작 버튼을 누를 때 휴대폰 위치가 허용 반경 안이어야 합니다. 꺼 두면 위치만 기록합니다."
        />
      </Fold>

      <Fold
        title="급여"
        open={isNew}
        summary={brief(
          `${payType === 'daily' ? `일급 ${won(Number(v('daily_wage')))}` : `시급 ${won(Number(v('hourly_wage')))}`}${est ? ` · 하루 약 ${won(est.gross)}` : ''}`,
        )}
      >
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
      </Fold>

      <Fold
        title="세금 · 보험 공제"
        summary={brief(
          `${{ daily: '일용근로소득', business: '사업소득 3.3%', none: '공제 없음' }[taxType]}${taxType === 'daily' && fd?.get('employment_insurance') ? ' · 고용보험 0.9%' : ''}`,
        )}
      >
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
      </Fold>

      <Fold
        title="근무 안내"
        summary={brief(
          [v('dress_code') && `복장 ${v('dress_code')}`, v('supplies') && `준비물 ${v('supplies')}`, v('manager_name') && `담당 ${v('manager_name')}`]
            .filter(Boolean)
            .join(' · ') || '복장·준비물·현장 담당자',
        )}
      >
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
      </Fold>

      <PostingEditor initial={job?.conditions ?? []} hidden={job?.hidden_fields ?? []} />

      <Fold
        id="docs"
        title="확정 후 서명받을 서류"
        className="space-y-3"
        summary={brief(
          [CONTRACT_TEXT[contractMethod] && `계약서 ${CONTRACT_TEXT[contractMethod]}`, docTitles.length ? docTitles.join(', ') : contractMethod === 'app' ? '⚠️ 없음 (근로계약서는 꼭 받아야 해요)' : '']
            .filter(Boolean)
            .join(' · '),
        )}
      >
        {/* 근로계약서 받는 방법 (앱 전자서명 / 종이 / 모두싸인 등) */}
        <div>
          <p className="label">근로계약서 받는 방법</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['app', '앱에서 전자서명', '확정되면 앱으로 서명 요청'],
                ['paper', '종이(서면)로 받기', '현장에서 종이에 작성'],
                ['external', '다른 서비스', '모두싸인 등 전자계약'],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-xl px-3.5 py-3 ring-1 transition ${
                  contractMethod === value ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-line'
                }`}
              >
                <input
                  type="radio"
                  name="contract_method"
                  value={value}
                  defaultChecked={(job?.contract_method ?? 'app') === value}
                  className="sr-only"
                />
                <span className="block text-sm font-bold">{label}</span>
                <span className="block text-xs text-mute">{hint}</span>
              </label>
            ))}
          </div>
          {contractMethod === 'external' && (
            <div className="mt-3">
              <Field label="서명 링크 (선택)">
                <input name="contract_url" className="input" inputMode="url" placeholder="https://..." defaultValue={job?.contract_url ?? ''} />
              </Field>
              <p className="hint">모두싸인에서 근무자마다 문자·카톡으로 링크를 보내면 비워 두세요. 근무자 앱에는 ‘모두싸인 등에서 온 링크로 서명해 주세요’라고 안내돼요.</p>
            </div>
          )}
          {contractMethod !== 'app' && (
            <p className="hint mt-2">
              앱에서는 근로계약서 서명을 요청하지 않아요. 받은 뒤 공고의 ‘서류’ 탭에서 사람마다 ‘받음’을 눌러 기록해 주세요. 출퇴근 화면에 아직 안 받은 사람이 표시돼요.
            </p>
          )}
        </div>
        <p className="label mt-1">{contractMethod === 'app' ? '앱에서 서명받을 서류' : '앱에서 서명받을 서류 (근로계약서 서식은 빠져요)'}</p>
        {templates.length === 0 && <p className="text-sm text-mute">등록된 서식이 없습니다. 서류 서식 메뉴에서 기본 서식을 불러오세요.</p>}
        {templates.map((t) => (
          <Check
            key={t.id}
            name="required_docs"
            value={t.id}
            label={contractMethod !== 'app' && t.kind === 'contract' ? `${t.title} (${CONTRACT_TEXT[contractMethod]}로 받으므로 앱에선 안 받음)` : t.title}
            defaultChecked={job ? job.required_docs.includes(t.id) : t.is_default}
          />
        ))}
        <p className="hint">체크한 서류에 서명해야 근무 시작 버튼이 열립니다. 근로계약서는 근로기준법 제17조에 따라 꼭 서면(종이 또는 전자문서)으로 주어야 합니다.</p>
      </Fold>

      <Fold title="공개 설정" summary={brief(`${STATUS_TEXT[v('status')] ?? ''}${fd?.get('auto_approve') ? ' · 지원하면 바로 확정' : ' · 관리자가 확정'}`)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="상태">
            <select name="status" className="input" defaultValue={job?.status ?? 'open'}>
              <option value="open">모집중 (목록에 공개)</option>
              <option value="closed">모집마감 (목록에 보이되 지원 불가)</option>
              <option value="draft">임시저장 (비공개)</option>
              <option value="done">종료</option>
              {job?.status === 'cancelled' && <option value="cancelled">행사 취소</option>}
            </select>
          </Field>
        </div>
        <Check name="auto_approve" label="지원하면 바로 확정 (모집 인원까지)" defaultChecked={job?.auto_approve} hint="끄면 관리자가 지원자를 보고 확정합니다." />
      </Fold>

      {/* 고칠 때: 일정·장소·급여가 바뀌면 확정자·지원자에게 바로 알림 (오타만 고칠 때는 끌 수 있게) */}
      {job && job.status !== 'cancelled' && (
        <div className="card p-4">
          <Check
            name="notify_change"
            value="1"
            defaultChecked
            label="날짜·시간·장소·급여가 바뀌면 확정자·지원자에게 알리기"
            hint="바뀐 내용(이전 → 변경)을 앱 문의함과 휴대폰 알림으로 보내요. 오타만 고칠 때는 꺼 주세요."
          />
        </div>
      )}

      <div className="sticky bottom-3 z-10 pt-2">
        <FormMessage state={state} />
        <SubmitButton className="btn-primary mt-2 w-full py-3.5 text-base shadow-lg" pendingText="저장 중…">
          {job ? '공고 저장' : '공고 등록'}
        </SubmitButton>
      </div>
    </form>
  )
}
