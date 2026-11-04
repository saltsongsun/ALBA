'use client'

import { useEffect, useRef, useState } from 'react'
import { haptic } from './ui'

/** 근로계약서·임금명세서에 꼭 들어가는 회사 정보 (대시보드 '회사 설정을 마무리해 주세요'와 같은 항목) */
export const SETUP_ITEMS = [
  { key: 'business_no', label: '사업자등록번호' },
  { key: 'company_address', label: '회사 주소' },
  { key: 'seal', label: '직인' },
  { key: 'contact_phone', label: '문의 연락처' },
] as const
export type SetupKey = (typeof SETUP_ITEMS)[number]['key']

/** 그 항목의 입력칸(직인은 직인 칸)으로 가서 바로 쓸 수 있게 */
function jump(form: HTMLFormElement, key: SetupKey) {
  const target = key === 'seal' ? form.querySelector<HTMLElement>('#seal') : form.querySelector<HTMLInputElement>(`input[name="${key}"]`)
  if (!target) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  const focusEl = key === 'seal' ? target.querySelector<HTMLElement>('input[type=file], button, label') : target
  focusEl?.focus({ preventScroll: true })
  target.classList.remove('animate-pop')
  void target.offsetWidth
  target.classList.add('animate-pop')
}

/**
 * 회사 설정 맨 위: 계약서에 들어가는 정보 4가지가 채워졌는지 (쓰는 대로 바로 ✓).
 * 빈 항목을 누르면 그 칸으로 가서 커서, 빈 칸에는 노란 테두리. 다 채우면 '모두 채웠어요'가 톡.
 * 주소 끝 #business_no 처럼 오면(대시보드 안내) 그 칸으로 바로
 */
export default function SetupChecklist({ initial }: { initial: Record<SetupKey, boolean> }) {
  const ref = useRef<HTMLDivElement>(null)
  const sealAtFirst = useRef(initial.seal)
  const [filled, setFilled] = useState(initial)
  const allAtFirst = useRef(SETUP_ITEMS.every((it) => initial[it.key]))
  const done = SETUP_ITEMS.filter((it) => filled[it.key]).length
  const complete = done === SETUP_ITEMS.length

  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const read = () => {
      const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value.trim() ?? ''
      const removeSeal = (form.elements.namedItem('remove_seal') as HTMLInputElement | null)?.checked ?? false
      const next = {
        business_no: !!val('business_no'),
        company_address: !!val('company_address'),
        seal: !!val('seal_data') || (sealAtFirst.current && !removeSeal),
        contact_phone: !!val('contact_phone'),
      }
      // 빈 칸 표시 (노란 테두리)
      for (const it of SETUP_ITEMS) {
        if (it.key === 'seal') continue
        form.querySelector(`input[name="${it.key}"]`)?.toggleAttribute('data-missing', !next[it.key])
      }
      setFilled((prev) => {
        if (SETUP_ITEMS.every((it) => prev[it.key] === next[it.key])) return prev
        if (SETUP_ITEMS.every((it) => next[it.key]) && !SETUP_ITEMS.every((it) => prev[it.key])) haptic([10, 40, 14])
        return next
      })
    }
    read()
    // (직인 칸은 그림을 다 만든 뒤 change를 알려 줌 — SealField)
    form.addEventListener('input', read)
    form.addEventListener('change', read)
    // 대시보드에서 '#빈 항목'으로 왔으면 그 칸으로
    const hash = decodeURIComponent(location.hash.slice(1)) as SetupKey
    if (SETUP_ITEMS.some((it) => it.key === hash)) setTimeout(() => jump(form, hash), 250)
    return () => {
      form.removeEventListener('input', read)
      form.removeEventListener('change', read)
    }
  }, [])

  // 처음부터 다 채운 회사는 안 보여 줌
  if (allAtFirst.current && complete) return null
  return (
    <div ref={ref} className="card space-y-3 p-4" data-setup-checklist>
      {complete ? (
        <p className="flex animate-pop items-center gap-2 font-bold text-emerald-700" data-setup-complete>
          <span className="grid size-7 place-items-center rounded-full bg-emerald-500 text-sm text-white">✓</span>
          계약서에 들어갈 정보를 모두 채웠어요. 아래 &lsquo;저장&rsquo;을 눌러 주세요
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">계약서·명세서에 들어가는 정보</h2>
            <span className="text-sm font-bold text-brand-700 tabular-nums">
              {done}/{SETUP_ITEMS.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${(done / SETUP_ITEMS.length) * 100}%` }} />
          </div>
          {/* 휴대폰은 한 줄에 하나 (항목 이름이 잘리지 않게), 넓은 화면은 두 줄 */}
          <ul className="grid gap-2 sm:grid-cols-2">
            {SETUP_ITEMS.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  data-setup-item={it.key}
                  data-done={filled[it.key] ? '' : undefined}
                  onClick={() => {
                    const form = ref.current?.closest('form')
                    if (form) jump(form, it.key)
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition active:scale-[0.98] ${
                    filled[it.key] ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] text-white ${filled[it.key] ? 'bg-emerald-500' : 'bg-amber-400'}`}>
                    {filled[it.key] ? '✓' : '!'}
                  </span>
                  <span className="min-w-0 truncate">{it.label}</span>
                  {!filled[it.key] && <span className="ml-auto shrink-0 text-xs text-amber-700">채우기 →</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">빈 항목을 누르면 그 칸으로 가요.</p>
        </>
      )}
    </div>
  )
}
