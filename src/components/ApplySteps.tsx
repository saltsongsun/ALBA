/** 지원 → 확정 → 서명 → 출근 진행 단계 (지금 단계 강조) · 5 = 출근까지 마침 (모두 ✓) */
// 열면 끝난 단계가 왼쪽부터 차례로 채워짐: ✓ 동그라미가 톡 나타나고 사이 선이 차오름 (짧게 · '움직임 줄이기'면 바로)
const STEP_MS = 90
// labels로 다른 진행에도 씀 (예: 관리자 합류 '신청 → 승인 → 시작')
export default function ApplySteps({ step, labels = ['지원', '확정', '서명', '출근'] }: { step: 1 | 2 | 3 | 4 | 5; labels?: string[] }) {
  const steps = labels
  const total = steps.length
  return (
    <ol className="flex items-center gap-1" aria-label={step > total ? `진행 단계 ${total}/${total} · 모두 마침` : `진행 단계 ${step}/${total}`} data-apply-steps={step}>
      {steps.map((s, i) => {
        const n = i + 1
        const done = n < step
        const now = n === step
        return (
          <li key={s} className="flex flex-1 items-center gap-1">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${
                done ? 'animate-pop bg-brand-600 text-white' : now ? 'animate-pop bg-brand-50 text-brand-700 ring-2 ring-brand-500' : 'bg-bg text-mute'
              }`}
              style={done || now ? { animationDelay: `${i * STEP_MS}ms` } : undefined}
              data-step-dot={done ? 'done' : now ? 'now' : 'next'}
            >
              {done ? '✓' : n}
            </span>
            <span className={`text-xs font-semibold ${now ? 'text-brand-700' : done ? 'text-ink' : 'text-mute'}`}>{s}</span>
            {n < steps.length && (
              <span className="relative h-0.5 flex-1 overflow-hidden rounded bg-line">
                {done && (
                  <span
                    className="absolute inset-0 origin-left animate-[grow_0.26s_var(--ease-spring)_both] rounded bg-brand-500"
                    style={{ animationDelay: `${i * STEP_MS + 60}ms` }}
                    data-step-line
                  />
                )}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
