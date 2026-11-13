'use client'

import { useEffect, useState } from 'react'
import { XP_RULES, type XpState } from '@/lib/xp'

const SEEN = 'xp-level-seen'

/**
 * 내 근무 화면의 병아리 레벨 카드 (1단계: 재미용 기록 · 급여·확정과 무관).
 * 레벨이 오른 뒤 처음 열면 병아리가 톡 튀고 '레벨 업!' (이 휴대폰에서 마지막으로 본 레벨과 비교)
 * 디자인 (사용자 요청 2026-11-07 "좀 더 디자인 깔끔하게"): 병아리는 둥근 바탕에 얼굴만(스티커 위 글씨는 잘라냄) ·
 * 레벨은 작은 배지 · 얇은 막대 · 한 줄 안내 '근무 n번 더 하면 Lv.n' · 점수 얻는 법은 아래 가는 줄로 접어 둠
 */
export default function LevelCard({ s }: { s: XpState }) {
  const [up, setUp] = useState(false)
  // 병아리를 누르면 톡 뛰고 말풍선 한마디 (이용 기록: 병아리 그림을 여러 번 누름 — 눌러도 반응이 없었음)
  const [say, setSay] = useState<{ n: number; text: string } | null>(null)
  const lines = [
    '삐약! 👋',
    s.toNext > 0 ? `근무 ${s.shiftsToNext}번 더 하면 Lv.${s.level + 1}!` : '최고 레벨이에요 👑',
    '오늘도 화이팅!',
    '근무 끝나면 종료 꼭 눌러 줘요',
  ]
  const tap = () => setSay((p) => {
    const n = (p?.n ?? -1) + 1
    return { n, text: lines[n % lines.length] }
  })
  useEffect(() => {
    if (!say) return
    const t = setTimeout(() => setSay(null), 1800)
    return () => clearTimeout(t)
  }, [say])
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
    <section className="card relative p-0" data-xp-card data-level={s.level}>
      <div className="flex items-center gap-3.5 px-4 pt-3.5 pb-3">
        {/* 둥근 바탕 안에 병아리만 (스티커 위쪽 글씨는 살짝 확대하고 위로 올려 잘라냄 · 다섯 단계 스티커 모두 확인) · 누르면 톡 뛰고 한마디 */}
        <button
          type="button"
          onClick={tap}
          aria-label="병아리 (누르면 한마디)"
          data-xp-chick
          className="relative size-14 shrink-0 rounded-full transition-transform active:scale-95"
        >
          <span
            key={say?.n ?? 'idle'}
            className={`absolute inset-0 overflow-hidden rounded-full bg-amber-50 ring-1 ring-amber-100 ${say ? 'animate-hop' : up ? 'animate-pop' : ''}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.stage.img} alt="" className="absolute inset-0 size-full -translate-y-[15%] scale-[1.35] object-cover" />
          </span>
        </button>
        {/* 말풍선: 병아리 오른쪽 위 · 카드 위쪽 가장자리에 걸쳐 레벨 글자를 가리지 않게 (1.8초 뒤 사라짐) */}
        {say && (
          <span
            key={say.n}
            role="status"
            data-xp-say
            className="pointer-events-none absolute -top-2.5 left-[3.9rem] z-10 max-w-[calc(100%-5.5rem)] animate-pop truncate rounded-2xl rounded-bl-sm bg-ink px-2.5 py-1 text-xs font-semibold text-white shadow-md"
          >
            {say.text}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-700 tabular-nums" data-xp-level>
              Lv.{s.level}
            </span>
            <b className="min-w-0 truncate text-[15px]">{s.stage.name}</b>
            <span className="ml-auto shrink-0 text-xs font-semibold text-mute tabular-nums">{s.xp.toLocaleString('ko-KR')}점</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="다음 레벨까지">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#fbbf24,#f59e0b)] transition-[width] duration-700" style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-sub" data-xp-next>
            {s.toNext > 0 ? (
              <>
                근무 <b className="text-ink tabular-nums">{s.shiftsToNext}번</b> 더 하면 Lv.{s.level + 1}
              </>
            ) : (
              '최고 레벨이에요 👑'
            )}
          </p>
        </div>
      </div>
      {/* 점수 얻는 법: 카드 아래 가는 줄로 접어 둠 */}
      <details className="border-t border-line px-4 py-2.5 text-xs" data-xp-rules>
        <summary className="tap cursor-pointer font-semibold text-mute">점수 얻는 법</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sub">
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
