'use client'

/** 지원할 때 '한마디' 칸에 자주 쓰는 말을 눌러 넣기 (이미 있는 말은 다시 안 넣음) */
const PHRASES = ['행사 스태프 경험 있어요', '모든 날짜 가능해요', '일찍 도착할 수 있어요', '차량 있어요', '체력 자신 있어요', '처음이지만 열심히 할게요']

export default function MessageChips({ target }: { target: string }) {
  const add = (p: string) => {
    const el = document.getElementById(target) as HTMLInputElement | null
    if (!el) return
    const cur = el.value.trim()
    if (cur.includes(p)) return
    const next = cur ? `${cur}, ${p}` : p
    el.value = next.slice(0, el.maxLength > 0 ? el.maxLength : 300)
    el.focus()
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {PHRASES.map((p) => (
        <button key={p} type="button" onClick={() => add(p)} className="chip h-8 px-3 text-xs">
          + {p}
        </button>
      ))}
    </div>
  )
}
