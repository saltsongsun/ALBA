'use client'

import { useEffect, useState } from 'react'
import { XP_RULES, type XpState } from '@/lib/xp'

const SEEN = 'xp-level-seen'

/**
 * 내 근무 화면의 병아리 레벨 카드 (1단계: 재미용 기록 · 급여·확정과 무관).
 * 레벨이 오른 뒤 처음 열면 병아리가 톡 튀고 '레벨 업!' (이 휴대폰에서 마지막으로 본 레벨과 비교)
 */
export default function LevelCard({ s }: { s: XpState }) {
  const [up, setUp] = useState(false)
  useEffect(() => {
    try {
      const prev = Number(localStorage.getItem(SEEN) ?? 0)
      if (prev > 0 && s.level > prev) {
        setUp(true)
        const t = setTimeout(() => setUp(false), 3500)
        localStorage.setItem(SEEN, String(s.level))
        return () => clearTimeout(t)
      }
      localStorage.setItem(SEEN, String(s.level))
    } catch {}
  }, [s.level])
  const pct = Math.round(Math.min(1, Math.max(0, s.progress)) * 100)
  return (
    <section className="card relative space-y-2 py-3.5" data-xp-card data-level={s.level}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.stage.img} alt="" className={`size-14 shrink-0 ${up ? 'animate-pop' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <b className="truncate text-[15px]">
              Lv.{s.level} {s.stage.name}
            </b>
            <span className="shrink-0 text-xs font-semibold text-mute tabular-nums">{s.xp.toLocaleString('ko-KR')}점</span>
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="다음 레벨까지">
            <div className="h-full rounded-full bg-amber-400 transition-[width] duration-700" style={{ width: `${Math.max(pct, 3)}%` }} />
          </div>
          <p className="mt-1 text-xs text-sub" data-xp-next>
            {s.toNext > 0 ? `다음 레벨까지 근무 ${s.shiftsToNext}번 · ${s.toNext}점` : '최고 레벨이에요 👑'}
          </p>
        </div>
      </div>
      <details className="text-xs" data-xp-rules>
        <summary className="cursor-pointer font-semibold text-sub">점수 얻는 법</summary>
        <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sub">
          {XP_RULES.map((r) => (
            <li key={r.key} className="flex justify-between gap-2">
              <span className="truncate">{r.label}</span>
              <b className="shrink-0 text-amber-700 tabular-nums">+{r.xp}</b>
            </li>
          ))}
        </ul>
      </details>
      {up && (
        <p role="status" data-level-up className="absolute -top-3 right-3 animate-pop rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold text-white shadow-md">
          🎉 레벨 업! Lv.{s.level}
        </p>
      )}
    </section>
  )
}
