/** 지원 진행 단계: 지원 → 확정 → 서명 → 출근 (지금 어디까지 왔는지) */
export default function ApplySteps({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = ['지원', '확정', '서명', '출근']
  return (
    <ol className="flex items-center gap-1" aria-label={`진행 단계 ${step}/4`}>
      {steps.map((s, i) => {
        const n = i + 1
        const done = n < step
        const now = n === step
        return (
          <li key={s} className="flex flex-1 items-center gap-1">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${
                done ? 'bg-brand-600 text-white' : now ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500' : 'bg-bg text-mute'
              }`}
            >
              {done ? '✓' : n}
            </span>
            <span className={`text-xs font-semibold ${now ? 'text-brand-700' : done ? 'text-ink' : 'text-mute'}`}>{s}</span>
            {n < steps.length && <span className={`h-0.5 flex-1 rounded ${done ? 'bg-brand-500' : 'bg-line'}`} />}
          </li>
        )
      })}
    </ol>
  )
}
