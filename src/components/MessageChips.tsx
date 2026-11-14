'use client'

/** 지원할 때 '한마디' 칸에 자주 쓰는 말을 눌러 넣기 (이미 있는 말은 다시 안 넣음) */
const PHRASES = ['행사 스태프 경험 있어요', '모든 날짜 가능해요', '일찍 도착할 수 있어요', '차량 있어요', '체력 자신 있어요', '처음이지만 열심히 할게요']
/** 전문가 의뢰: 회사가 고를 때 궁금한 것 (경험·장비·포트폴리오·리허설) */
const PRO_PHRASES = ['비슷한 행사 경험', '장비 지참 가능', '포트폴리오 있어요', '리허설 참여 가능', '모든 날짜 가능해요', '팀 구성 가능']

/** 하루짜리 공고엔 '모든 날짜 가능해요'가 뜻이 없어서 뺌 (multiDay: 여러 날 행사일 때만) */
export default function MessageChips({ target, pro = false, multiDay = true }: { target: string; pro?: boolean; multiDay?: boolean }) {
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
      {(pro ? PRO_PHRASES : PHRASES).filter((p) => multiDay || p !== '모든 날짜 가능해요').map((p) => (
        <button key={p} type="button" onClick={() => add(p)} className="chip h-8 px-3 text-xs">
          + {p}
        </button>
      ))}
    </div>
  )
}
