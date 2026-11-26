'use client'

import UnsavedBar from '@/components/UnsavedBar'
import Link from 'next/link'
import { useActionState, useEffect, useMemo, useOptimistic, useRef, useState } from 'react'
import { rateWorker, resetPin, revealRrn, revealWorkerField, saveSettings, saveTemplate, setPosition, updateWorker, type RevealField } from '@/app/actions/admin'
import { renderTemplate } from '@/lib/docs'
import { PLACEHOLDERS } from '@/lib/default-templates'
import type { DocTemplate, Settings } from '@/lib/types'
import { DocBody } from './DocSheet'
import { onPhoneInput, phoneShown } from './phoneTyping'
import SealField from './SealField'
import CompanyMark, { companyInitial } from './CompanyMark'
import TemplateSections, { parseDoc, serializeDoc, type DocModel } from './TemplateSections'
import { FormMessage, haptic, keepInputs, SubmitButton } from './ui'
import SetupChecklist from './SetupChecklist'
import BizNoField from './BizNoField'
import { MIN_WAGE_2026 } from '@/lib/pay'

export function RevealRrn({ userId, masked }: { userId: string; masked: string | null }) {
  const [state, action] = useActionState(revealRrn.bind(null, userId), null)
  return (
    <form action={action} onReset={keepInputs} className="flex flex-wrap items-center gap-2">
      {/* 가린 번호 자체를 눌러도 열림 (이용 기록: 가린 글자를 여러 번 누름 — 버튼과 같은 열람 · 똑같이 기록됨) */}
      {!state?.ok && masked ? (
        <button type="submit" className="font-mono" aria-label="주민등록번호 전체 보기 (기록됨)" data-reveal-value>
          {masked}
        </button>
      ) : (
        <span className="font-mono">{state?.ok ?? masked ?? '미등록'}</span>
      )}
      {/* 버튼 글자는 짧게 '전체 보기' · 열람이 기록된다는 안내는 근무자 화면 정보 표 아래 한 줄로 (UI 정리 2026-11-26) */}
      {!state?.ok && masked && <SubmitButton className="btn-gray btn-sm">전체 보기</SubmitButton>}
      {state?.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  )
}

/**
 * 보안: 가린 값만 먼저 보여 주고 '전체 보기'(기록됨)를 누르면 서버에서 받아 보여 줌.
 * 휴대폰·비상연락처는 전화·문자 버튼도 — 누르면 열람을 기록하고 바로 걸기/문자 (번호가 화면 코드에 미리 실리지 않게)
 */
export function RevealInfo({
  userId,
  field,
  masked,
  call = false,
  rows = false,
  children,
}: {
  userId: string
  field: RevealField
  masked: string
  call?: boolean
  /** 정보 표(dl) 안에서: 값 줄(<dd>) + 그 아래 칸 전체 너비 연락 버튼 줄(<dd>)로 나눠 그림 (좁은 화면에서 옆으로 밀리지 않게) */
  rows?: boolean
  children?: React.ReactNode
}) {
  const [value, setValue] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const get = async (): Promise<string | null> => {
    if (value) return value
    setPending(true)
    const r = await revealWorkerField(userId, field).catch(() => ({ error: '잠시 뒤에 다시 시도해 주세요.' }) as { ok?: string; error?: string })
    setPending(false)
    if (r.ok) {
      setValue(r.ok)
      setError('')
      return r.ok
    }
    setError(r.error ?? '볼 수 없어요.')
    return null
  }
  const go = async (scheme: 'tel' | 'sms') => {
    const v = await get()
    const digits = v?.replace(/\D/g, '')
    if (digits) window.location.href = `${scheme}:${digits}`
  }
  const valuePart = (
    <>
      {/* 가린 값 자체를 눌러도 열림 (이용 기록: 가린 글자를 여러 번 누름 — 버튼과 같은 열람 · 똑같이 기록됨) */}
      {value ? (
        <span data-reveal-value>{value}</span>
      ) : (
        <button type="button" className="tracking-wide text-sub" onClick={get} disabled={pending} aria-label="전체 보기 (기록됨)" data-reveal-value>
          {masked}
        </button>
      )}
      {!value && (
        <button type="button" className="contact-btn bg-bg text-sub hover:bg-line" onClick={get} disabled={pending} aria-label="전체 보기 (기록됨)" data-reveal-btn>
          {pending ? '…' : '전체 보기'}
        </button>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </>
  )
  const callPart =
    call || children ? (
      // 전화·문자(·앱 메시지)는 한 덩어리로 (좁은 화면에서 따로 꺾이지 않게)
      <span className="inline-flex flex-nowrap gap-1.5" data-contact-group>
        {call && (
          <button type="button" className="contact-btn bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onClick={() => go('tel')} aria-label="전화 (열람 기록)">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
            </svg>
            전화
          </button>
        )}
        {call && (
          <button type="button" className="contact-btn bg-brand-50 text-brand-700 hover:bg-brand-100" onClick={() => go('sms')} aria-label="문자 (열람 기록)">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
            </svg>
            문자
          </button>
        )}
        {children}
      </span>
    ) : null
  if (rows)
    return (
      <>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 tabular-nums" data-reveal={field}>
          {valuePart}
        </dd>
        {callPart && (
          <dd className="col-span-2 -mt-0.5 flex flex-wrap items-center gap-1.5" data-worker-contact>
            {callPart}
          </dd>
        )}
      </>
    )
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1.5" data-reveal={field}>
      {valuePart}
      {callPart}
    </span>
  )
}

export function ResetPin({ userId }: { userId: string }) {
  const [state, action] = useActionState(resetPin.bind(null, userId), null)
  return (
    <form action={action} onReset={keepInputs} className="space-y-2">
      {state?.ok ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          임시 비밀번호 <b className="font-mono text-lg tracking-widest">{state.ok}</b> — 근무자에게 알려 주고 로그인 후 바꾸도록 안내하세요. (이 화면을 벗어나면 다시 볼 수 없습니다)
        </p>
      ) : (
        <SubmitButton className="btn-gray btn-sm">비밀번호 초기화</SubmitButton>
      )}
      {state?.error && <FormMessage state={state} />}
    </form>
  )
}

export function WorkerEditForm({
  userId,
  initial,
  canSuspend = false,
  canGrant = false,
  canEditIdentity = false,
}: {
  userId: string
  initial: { name: string; phone: string; role: string; active: boolean; admin_memo: string }
  /** 계정 정지는 모든 회사에 영향 → 최고 관리자만 */
  canSuspend?: boolean
  /** 이 회사 관리자 추가·해제 → 최고 관리자·대표 관리자만 */
  canGrant?: boolean
  /** 휴대폰 번호(로그인 번호)는 모든 회사 공용 계정의 열쇠 → 최고 관리자만 */
  canEditIdentity?: boolean
}) {
  const [state, action] = useActionState(updateWorker.bind(null, userId), null)
  return (
    <form action={action} onReset={keepInputs} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">이름</span>
          <input name="name" className="input" defaultValue={initial.name} />
        </label>
        <label>
          <span className="label">휴대폰 번호{!canEditIdentity && ' (본인만 바꿀 수 있어요)'}</span>
          {canEditIdentity ? (
            <input name="phone" className="input" inputMode="tel" maxLength={13} defaultValue={phoneShown(initial.phone)} onInput={onPhoneInput} />
          ) : (
            // 보안: 번호를 화면에 싣지 않음 (가린 번호만, 폼으로 보내지도 않음)
            <input className="input bg-bg text-sub" value={initial.phone} readOnly disabled aria-readonly />
          )}
        </label>
      </div>
      <label className="block">
        <span className="label">관리자 메모 (근무자·다른 회사에는 보이지 않음)</span>
        <textarea name="admin_memo" rows={3} className="input" defaultValue={initial.admin_memo} placeholder="성실함, 무대 경험 있음 등" />
      </label>
      <div className="flex flex-wrap gap-4 text-sm">
        {canGrant ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="role" value="admin" defaultChecked={initial.role === 'admin'} className="size-5 accent-brand-600" />
            이 회사 관리자
          </label>
        ) : (
          initial.role === 'admin' && <input type="hidden" name="role" value="admin" />
        )}
        {canSuspend && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="inactive" defaultChecked={!initial.active} className="size-5 accent-brand-600" />
            로그인 정지 (모든 회사)
          </label>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary btn-sm">저장</SubmitButton>
    </form>
  )
}

const SAMPLE: Record<string, string> = {
  근로자명: '홍길동',
  생년월일: '2001년 3월 4일',
  연락처: '010-1234-5678',
  주소: '경남 진주시 ○○로 12',
  회사명: '주식회사 예시회사',
  대표자: '대표자',
  사업자번호: '000-00-00000',
  회사주소: '경남 진주시',
  회사연락처: '055-000-0000',
  행사명: '2026 진주남강유등축제',
  공고명: '안내·질서 스태프',
  업무내용: '관람객 안내, 동선 통제',
  근무장소: '진주성 일원',
  근무기간: '2026년 10월 1일 ~ 2026년 10월 3일',
  근무시간: '09:00 ~ 18:00',
  휴게시간: '1시간 (근무 중 자유 이용)',
  임금: '시급 10,320원 (실제 근로시간 × 시급)',
  수당: '교통비 1일 10,000원',
  가산수당: '해당 없음',
  공제내역: '일용근로소득세 및 지방소득세 원천징수, 고용보험료 0.9%',
  지급일: '행사 종료 후 7일 이내',
  복장: '검정 바지, 운동화',
  준비물: '신분증',
  담당자: '김담당 010-0000-0000',
  작성일: '2026년 10월 1일',
}

export function TemplateEditor({ tpl }: { tpl: DocTemplate | null }) {
  const [state, action] = useActionState(saveTemplate.bind(null, tpl?.id ?? null), null)
  // 기본은 항목(조항)별 편집, 필요하면 글 전체를 한 번에 고칠 수도 있게
  const [mode, setMode] = useState<'items' | 'text'>('items')
  const [model, setModel] = useState<DocModel>(() => parseDoc(tpl?.body ?? '# 제목\n\n## 1. 항목\n- 내용'))
  const [raw, setRaw] = useState('')
  const body = mode === 'items' ? serializeDoc(model) : raw
  const preview = useMemo(() => renderTemplate(body, SAMPLE), [body])
  const insert = useRef<((token: string) => void) | null>(null)
  const switchMode = (m: 'items' | 'text') => {
    if (m === mode) return
    if (m === 'text') setRaw(serializeDoc(model))
    else setModel(parseDoc(raw))
    setMode(m)
  }
  return (
    <form action={action} onReset={keepInputs} className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="card space-y-3">
          {/* 두 칸에 이름표 (전엔 이름 칸과 종류 칸이 둘 다 '근로계약서'라 무엇인지 헷갈림 · 정기 개선 2026-11-24 07:35) */}
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs font-semibold text-sub">서식 이름</span>
              <input name="title" className="input" defaultValue={tpl?.title} placeholder="예: 단기 근로계약서" required />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold text-sub">종류</span>
            <select name="kind" className="input" defaultValue={tpl?.kind ?? 'contract'}>
              <option value="contract">근로계약서</option>
              <option value="service">용역계약서 (전문가)</option>
              <option value="pledge">서약서</option>
              <option value="consent">동의서</option>
              <option value="other">기타</option>
            </select>
            </label>
          </div>
          {/* 고치는 방법 두 칸: 흰 막대가 고른 칸으로 미끄러져 감 (0.2초 · 움직임 줄이기면 바로) */}
          <div className="relative grid grid-cols-2 gap-1 rounded-xl bg-bg p-1 text-sm font-semibold" data-tpl-mode={mode}>
            <span
              aria-hidden
              className={`absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-lg bg-white shadow-sm transition-transform duration-200 ease-[var(--ease-spring)] ${mode === 'text' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'}`}
              data-tpl-pill
            />
            {(
              [
                ['items', '항목별로 고치기'],
                ['text', '글 전체로 고치기'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                aria-pressed={mode === m}
                className={`relative z-10 rounded-lg py-2 transition-colors duration-200 active:scale-[0.98] ${mode === m ? 'text-ink' : 'text-mute'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input type="hidden" name="body" value={body} />
          {mode === 'items' ? (
            <TemplateSections model={model} onChange={setModel} insertRef={insert} />
          ) : (
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={26}
              className="input font-mono text-[13px] leading-relaxed"
            />
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_default" defaultChecked={tpl?.is_default} className="size-5 accent-brand-600" />새 공고에 기본 체크
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="inactive" defaultChecked={tpl ? !tpl.active : false} className="size-5 accent-brand-600" />
              사용 안 함
            </label>
          </div>
          <FormMessage state={state} />
          <SubmitButton>서식 저장</SubmitButton>
        </div>
        <div className="card text-xs text-sub">
          <p className="mb-2 font-semibold text-ink">
            {mode === 'items'
              ? '자리채움: 칸을 누른 뒤 아래 단추를 누르면 그 자리에 들어가요. 서명할 때 공고·근로자·회사 정보로 바뀌어요.'
              : '쓰는 법: # 제목 · ## 소제목 · - 목록 · {{항목}} 자리채움'}
          </p>
          <div className="flex flex-wrap gap-1">
            {PLACEHOLDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.desc}
                className="rounded-md bg-bg px-1.5 py-0.5 font-mono hover:bg-brand-50"
                onMouseDown={(e) => e.preventDefault()} // 누르는 동안 입력 칸의 커서를 잃지 않게
                onClick={() => (mode === 'items' ? insert.current?.(`{{${p.key}}}`) : setRaw((b) => `${b}{{${p.key}}}`))}
              >
                {`{{${p.key}}}`}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <p className="mb-3 text-xs font-semibold text-mute">미리보기 (예시 값)</p>
        <DocBody text={preview} />
      </div>
    </form>
  )
}

/**
 * 새 회사(공고를 아직 안 올림): 회사 정보를 저장한 그 자리에서 다음 할 일(첫 공고 올리기)로.
 * 저장 버튼이 아래 탭 위의 바에도 있어, 어디서 저장했든 보이게 화면 가운데로 옮김
 * left: 계약서에 들어가는 정보 4가지 가운데 아직 빈 것
 */
function SetupNext({ left, back }: { left: number; back?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    // 저장 뒤 화면이 바뀌며(아래 저장 바가 사라지는 등) 부드러운 이동이 끊기면 한 번 더 — 느린 휴대폰에서도 카드가 화면 안에 보이게
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect()
      if (r.top < 56 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'auto', block: 'center' })
    }, 800)
    return () => clearTimeout(t)
  }, [])
  return (
    <div ref={ref} className="animate-pop space-y-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200/70" data-settings-next={left === 0 ? 'done' : 'partial'}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500 font-bold text-white">
          ✓
        </span>
        <p className="min-w-0 flex-1 text-sm text-emerald-900">
          <b className="block">{left === 0 ? '회사 정보를 다 채웠어요' : '저장했어요'}</b>
          <span className="block text-xs text-emerald-800">
            {back
              ? left === 0
                ? '서명 전 계약서에 바로 들어가요'
                : `남은 ${left}가지도 채우면 좋아요`
              : left === 0
                ? '다음은 첫 공고 올리기예요'
                : `남은 ${left}가지는 계약서 보내기 전에 채워 주세요`}
          </span>
        </p>
      </div>
      {/* 공고 '서류' 탭의 '채우기'로 왔으면 그 공고 서류로 돌아가기, 새 회사면 첫 공고 올리기 */}
      {back ? (
        <Link href={`/admin/jobs/${back}?tab=docs`} className="btn-primary btn-sm min-h-10 w-full" transitionTypes={['nav-back']} data-settings-back>
          공고 서류로 돌아가기 →
        </Link>
      ) : (
        <Link href="/admin/jobs/new" className="btn-primary btn-sm min-h-10 w-full">
          첫 공고 올리기 →
        </Link>
      )}
    </div>
  )
}

/**
 * 회사 설정: 근무자에게 우리 회사가 어떻게 보이는지 (상호 · 문의 담당 · 연락처) — 고치는 대로 바로 바뀜
 * 여러 회사가 함께 쓰므로 근무자는 회사 이름·연락처로 우리 회사를 알아봄 · 실제 회사 화면(공고 모음)으로 가는 링크
 */
function WorkerViewPreview({ formId, companyId, name, contactName, phone }: { formId: string; companyId: string; name: string; contactName: string; phone: string }) {
  const [v, setV] = useState({ name, contactName, phone: phoneShown(phone) })
  const [edited, setEdited] = useState(false)
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    let t: ReturnType<typeof setTimeout> | undefined
    const read = (e: Event) => {
      const n = (e.target as HTMLInputElement | null)?.name
      if (!['company_name', 'contact_name', 'contact_phone'].includes(n ?? '')) return
      const get = (k: string) => ((form.elements.namedItem(k) as HTMLInputElement | null)?.value ?? '').trim()
      // 번호 칸은 칸 자체의 입력 처리(하이픈 넣기)가 끝난 뒤에 읽음
      setTimeout(() => setV({ name: get('company_name'), contactName: get('contact_name'), phone: get('contact_phone') }), 0)
      setEdited(true)
      // 바뀔 때 테두리가 잠깐 진해짐 (어디가 바뀌는지 보이게)
      setBlink(true)
      clearTimeout(t)
      t = setTimeout(() => setBlink(false), 300)
    }
    form.addEventListener('input', read)
    return () => {
      form.removeEventListener('input', read)
      clearTimeout(t)
    }
  }, [formId])
  return (
    <div className="space-y-1.5 border-t border-line pt-4" data-worker-preview>
      <p className="flex items-center justify-between gap-2 text-xs font-semibold text-mute">
        <span>{edited ? '저장하면 근무자에게 이렇게 보여요' : '근무자에게 이렇게 보여요'}</span>
        <Link href={`/?co=${companyId}`} className="tap shrink-0 text-brand-600" data-preview-link>
          회사 화면 보기 →
        </Link>
      </p>
      <div
        className={`flex items-center gap-2.5 rounded-xl bg-bg px-3 py-2.5 ring-1 transition-[box-shadow,background-color] duration-200 ${blink ? 'bg-brand-50 ring-brand-300' : 'ring-line'}`}
        data-preview-card={blink ? 'changed' : ''}
      >
        {/* 근무자 화면(문의함·회사 화면·내 정보)과 같은 회사 첫 글자 · 상호 첫 글자가 바뀌면 한 번 톡 */}
        <CompanyMark key={companyInitial(v.name || '?')} name={v.name || '?'} className="size-9 animate-pop rounded-full bg-white text-base" />
        <span className="min-w-0 flex-1">
          <b className="block truncate" data-preview-name>
            {v.name || '상호를 넣어 주세요'}
          </b>
          <span className="block truncate text-xs text-sub" data-preview-contact>
            {v.phone ? `문의 ${v.contactName ? `${v.contactName} · ` : ''}${v.phone}` : '문의 연락처가 없어요 · 근무자가 연락할 곳이 없어요'}
          </span>
        </span>
      </div>
    </div>
  )
}

/** firstJob: 이 회사가 아직 공고를 한 번도 안 올렸는지 (새 회사 → 저장 뒤 다음 할 일을 이어 줌) */
export function SettingsForm({
  s,
  firstJob = false,
  company,
  companyId,
  backJob,
  others = [],
}: {
  s: Settings
  firstJob?: boolean
  company?: string
  companyId?: string
  /** 공고 '서류' 탭의 '채우기'로 왔을 때 그 공고 (저장 뒤 돌아가는 버튼) */
  backJob?: string
  /** 여러 회사를 맡은 관리자: 운영 기본값을 채울 수 있는 내 다른 회사 (값이 다른 곳만 · 최대 3곳) */
  others?: OtherDefaults[]
}) {
  const [state, action] = useActionState(saveSettings, null)
  const nextCard = (firstJob || !!backJob) && !!state?.ok
  const left = [s.business_no, s.company_address, s.seal_image, s.contact_phone].filter((v) => !v).length
  return (
    <form id="settings-form" action={action} onReset={keepInputs} className="space-y-5">
      {/* 고친 뒤 맨 아래 '설정 저장'을 잊고 나가지 않게: 아래 탭 위에 저장 바 */}
      <UnsavedBar formId="settings-form" state={state} />
      {/* 계약서에 들어가는 정보 4가지: 쓰는 대로 ✓, 누르면 그 칸으로 */}
      <SetupChecklist
        initial={{ business_no: !!s.business_no, company_address: !!s.company_address, seal: !!s.seal_image, contact_phone: !!s.contact_phone }}
      />
      <section className="card space-y-4">
        <div>
          <h2 className="font-bold">회사(사업주) 정보</h2>
          {/* 짧은 두 줄 (예전 '다른 회사가 쓸 때는 여기만 바꾸면 돼요'는 회사마다 설정이 따로라 뺌) */}
          <p className="hint" data-company-info-hint>
            <span className="block">근로계약서·임금명세서·모집 글에 들어가요.</span>
            <span className="block">이미 서명된 서류는 그때 정보 그대로예요.</span>
          </p>
        </div>
        {/* 짧은 칸은 휴대폰에서도 두 칸씩 (위아래로 덜 길게) */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <label className="col-span-2 sm:col-span-1">
            <span className="label">상호 *</span>
            <input name="company_name" className="input" defaultValue={s.company_name} required />
          </label>
          <label>
            <span className="label">대표자</span>
            <input name="ceo_name" className="input" defaultValue={s.ceo_name ?? ''} />
          </label>
          <label>
            <span className="label">회사 전화</span>
            <input name="company_phone" className="input" inputMode="tel" onInput={onPhoneInput} defaultValue={phoneShown(s.company_phone)} />
          </label>
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="business_no">
              사업자등록번호
            </label>
            <BizNoField defaultValue={s.business_no ?? ''} placeholder="000-00-00000" checkTaken="others" />
          </div>
          <label className="col-span-2">
            <span className="label">회사 주소</span>
            <input name="company_address" className="input" defaultValue={s.company_address ?? ''} />
          </label>
        </div>
      </section>
      <section id="seal" className="card scroll-mt-24 space-y-4">
        <h2 className="font-bold">직인</h2>
        <SealField current={s.seal_image} />
        {s.seal_image && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="remove_seal" className="size-4" /> 직인 삭제
          </label>
        )}
      </section>
      <section className="card space-y-4">
        <h2 className="font-bold">운영 기본값</h2>
        {others.length > 0 && <FillFromCompany formId="settings-form" others={others} />}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <label>
            <span className="label">문의 담당자</span>
            <input name="contact_name" className="input" defaultValue={s.contact_name ?? ''} />
          </label>
          <label>
            <span className="label">문의 연락처</span>
            <input name="contact_phone" className="input px-3" inputMode="tel" placeholder="010-1234-5678" onInput={onPhoneInput} defaultValue={phoneShown(s.contact_phone)} />
            <span className="hint" data-contact-hint>로그인·현장 연락처로 보여요</span>
          </label>
          <WageDefault value={s.default_hourly_wage} />
        </div>
        {companyId && <WorkerViewPreview formId="settings-form" companyId={companyId} name={s.company_name} contactName={s.contact_name ?? ''} phone={s.contact_phone ?? ''} />}
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="workplace_5plus" defaultChecked={s.workplace_5plus} className="mt-0.5 size-5 accent-brand-600" />
          <span>
            <b>상시 근로자 5인 이상 사업장</b>
            <span className="block text-xs text-mute">새 공고에 연장·야간 가산수당(50%)을 기본으로 켭니다.</span>
          </span>
        </label>
      </section>
      {/* 새 회사는 '저장했습니다' 대신 저장 버튼 아래에 다음 할 일 카드 하나로 (같은 말을 두 번 하지 않게) */}
      {!nextCard && <FormMessage state={state} />}
      {/* 여러 회사를 맡은 관리자: 버튼에도 어느 회사 설정인지 (두 줄 · 긴 이름은 줄임) */}
      <SubmitButton track="설정 저장" className={company ? 'btn-primary max-w-full py-2' : 'btn-primary'}>
        {company ? (
          <span className="flex min-w-0 flex-col items-center leading-tight">
            <span>설정 저장</span>
            <span className="max-w-full truncate text-xs font-medium text-white/80" data-settings-submit-company>
              {company}
            </span>
          </span>
        ) : (
          '설정 저장'
        )}
      </SubmitButton>
      {nextCard && <SetupNext left={left} back={backJob} />}
    </form>
  )
}

type OtherDefaults = { id: string; name: string; contact_name: string | null; contact_phone: string | null; default_hourly_wage: number | null }

/**
 * 운영 기본값(문의 담당자·연락처·기본 시급)을 내가 맡은 다른 회사 값으로 채우기 (정기 개선 2026-11-24 15:35 — 새 회사를 열 때 다시 치지 않게).
 * 칸만 채우고 저장은 '설정 저장'으로 (저장 바가 뜸) · 5인 이상 여부·상호·사업자번호·직인은 회사마다 달라 가져오지 않음.
 * 채워진 칸은 초록 테두리가 0.3초 한 번 · '✓ ○○ 값으로 채웠어요' (움직임 줄이기면 테두리 없이 글만)
 */
function FillFromCompany({ formId, others }: { formId: string; others: OtherDefaults[] }) {
  const [done, setDone] = useState<{ name: string; n: number } | null>(null)
  const fill = (o: OtherDefaults) => {
    const f = document.getElementById(formId) as HTMLFormElement | null
    if (!f) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pairs: [string, string | null][] = [
      ['contact_name', o.contact_name],
      ['contact_phone', o.contact_phone ? phoneShown(o.contact_phone) : null],
      ['default_hourly_wage', o.default_hourly_wage ? String(o.default_hourly_wage) : null],
    ]
    for (const [name, v] of pairs) {
      const el = f.elements.namedItem(name)
      if (v == null || !(el instanceof HTMLInputElement)) continue
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
      if (!still) el.animate?.([{ boxShadow: '0 0 0 3px rgb(16 185 129 / 0.5)' }, { boxShadow: '0 0 0 3px rgb(16 185 129 / 0)' }], { duration: 300, easing: 'ease-out' })
    }
    setDone((d) => ({ name: o.name, n: (d?.n ?? 0) + 1 }))
  }
  return (
    <div className="space-y-1" data-fill-from>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-mute">내 다른 회사 값으로</span>
        {others.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => fill(o)}
            className="max-w-[12rem] truncate rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-sub transition hover:border-brand-500 hover:text-brand-700 active:scale-95"
            data-fill-company={o.id}
          >
            {o.name}
          </button>
        ))}
      </div>
      {done && (
        <p key={done.n} className="animate-pop text-xs font-semibold text-emerald-700" data-fill-done>
          ✓ {done.name} 값으로 채웠어요 · 저장해야 바뀌어요
        </p>
      )}
    </div>
  )
}

/**
 * 기본 시급: 쓰는 대로 최저시급과 비교 (저장하면 서버가 최저시급으로 올려 맞추는데, 모르고 지나치지 않게 미리 알려 줌)
 * 휴대폰에서는 두 칸 너비 (안내가 꺾이지 않게)
 */
function WageDefault({ value }: { value: number }) {
  const [n, setN] = useState(value)
  const low = n > 0 && n < MIN_WAGE_2026
  const min = MIN_WAGE_2026.toLocaleString()
  return (
    <label className="col-span-2 sm:col-span-1">
      <span className="label">기본 시급(원)</span>
      <input
        type="number"
        name="default_hourly_wage"
        className="input"
        defaultValue={value}
        step={10}
        data-missing={low ? '' : undefined}
        onInput={(e) => setN(Number(e.currentTarget.value))}
      />
      <span className={`hint block ${low ? 'font-semibold text-amber-700' : ''}`} data-wage-hint={low ? 'low' : 'ok'}>
        {low ? (
          <>
            <span className="block">2026년 최저 {min}원보다 적어요</span>
            <span className="block font-normal">저장하면 {min}원으로 맞춰져요</span>
          </>
        ) : (
          `새 공고에 먼저 들어가요 · 2026년 최저 ${min}원`
        )}
      </span>
    </label>
  )
}

/**
 * 출퇴근 화면의 빠른 평가: 별을 누르면 바로 채워지고 저장됨 (다시 누르면 바뀜).
 * 별 하나하나를 손가락 크기(26×32)로 · 저장되면 별 위에 '✓ n점'이 잠깐 톡 (몇 점으로 저장됐는지 바로 보이게 · 자리는 차지하지 않음)
 */
export function QuickRate({ action, score }: { action: (form: FormData) => Promise<void>; score: number | null }) {
  const [shown, setShown] = useOptimistic(score)
  const [saved, setSaved] = useState<number | null>(null)
  useEffect(() => {
    if (saved == null) return
    const t = setTimeout(() => setSaved(null), 1800)
    return () => clearTimeout(t)
  }, [saved])
  return (
    <form
      action={async (form) => {
        const n = Number(form.get('score'))
        setShown(n)
        haptic(8)
        await action(form)
        setSaved(n)
      }}
      className="relative inline-flex items-center"
      data-quick-rate
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          name="score"
          value={n}
          aria-label={`${n}점`}
          className={`grid h-8 w-[26px] place-items-center text-lg leading-none transition duration-150 active:scale-75 ${n <= (shown ?? 0) ? 'text-amber-400' : 'text-line hover:text-amber-200'}`}
        >
          ★
        </button>
      ))}
      <span aria-live="polite" className="pointer-events-none absolute -top-4 right-0 text-[11px] font-bold whitespace-nowrap text-emerald-700" data-rate-saved={saved ?? undefined}>
        {saved != null && (
          <span key={saved} className="inline-block animate-pop">
            ✓ {saved}점
          </span>
        )}
      </span>
    </form>
  )
}

const SCORE_LABELS = ['', '아쉬워요', '조금 아쉬워요', '보통이에요', '좋아요', '최고예요']

/** 근무자 정보 화면의 평가 쓰기 (관리자끼리만 봄) */
export function RatingForm({ userId, jobs }: { userId: string; jobs: { id: string; title: string }[] }) {
  const [state, action] = useActionState(rateWorker.bind(null, userId), null)
  const [score, setScore] = useState(0)
  const [hover, setHover] = useState(0)
  const show = hover || score
  return (
    <form action={action} onReset={keepInputs} className="space-y-3">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n}점`}
            aria-pressed={score === n}
            onClick={() => {
              setScore(n)
              haptic(8)
            }}
            onMouseEnter={() => setHover(n)}
            className={`px-0.5 text-3xl leading-none transition duration-150 active:scale-75 ${n <= show ? 'scale-110 text-amber-400' : 'text-line'}`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm font-semibold text-sub">{SCORE_LABELS[show]}</span>
      </div>
      <input type="hidden" name="score" value={score} />
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <select name="job_id" className="input py-2 text-sm" defaultValue={jobs[0]?.id ?? ''}>
          <option value="">공고 없이 메모</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
        <textarea name="comment" className="input py-2 text-sm" rows={2} maxLength={500} placeholder="예) 시간 약속 잘 지킴, 관람객 안내 능숙" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary btn-sm" pendingText="저장 중…">
        평가 저장
      </SubmitButton>
    </form>
  )
}

/** 현장 배치 칸: 고치고 칸을 벗어나거나 엔터를 누르면 바로 저장 (listId의 datalist로 이미 쓴 배치를 골라 넣음) */
export function PositionInput({ appId, value, listId }: { appId: string; value: string | null; listId: string }) {
  const [state, action, pending] = useActionState(setPosition.bind(null, appId), null)
  const [v, setV] = useState(value ?? '')
  const saved = useRef(value ?? '')
  const formRef = useRef<HTMLFormElement>(null)
  const save = () => {
    const next = v.trim()
    if (next === saved.current) return
    saved.current = next
    haptic(8)
    formRef.current?.requestSubmit()
  }
  return (
    <form ref={formRef} action={action} onReset={keepInputs} className="inline-flex items-center gap-1.5">
      <span className="text-xs font-semibold text-mute">배치</span>
      <input
        name="position"
        value={v}
        list={listId}
        maxLength={30}
        placeholder="미배치"
        aria-label="현장 배치"
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        className={`w-28 rounded-lg px-2 py-0.5 text-base font-semibold outline-none transition placeholder:font-normal placeholder:text-mute focus:bg-white focus:ring-2 focus:ring-brand-500/40 ${
          v ? 'bg-brand-50 text-brand-700' : 'bg-bg'
        }`}
      />
      <span aria-live="polite" className="w-4 text-xs">
        {pending ? '…' : state?.ok ? <span className="text-emerald-600">✓</span> : state?.error ? <span className="text-rose-500">!</span> : null}
      </span>
    </form>
  )
}
