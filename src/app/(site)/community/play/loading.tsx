/** 놀이터를 불러오는 동안 (운세 카드 · 챌린지 · 퀴즈 · 배지 모양) */
export default function Loading() {
  const bar = 'rounded-md bg-line/70'
  return (
    <div aria-busy="true" aria-label="놀이터 불러오는 중" className="skeleton space-y-4" data-skeleton="play">
      <div className={`h-5 w-20 ${bar}`} />
      <div className="space-y-2">
        <div className={`h-7 w-24 ${bar}`} />
        <div className={`h-4 w-56 ${bar}`} />
      </div>
      <div className="h-20 rounded-[22px] bg-line/60" />
      <div className="card space-y-3">
        <div className={`h-5 w-28 ${bar}`} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className={`h-4 w-40 ${bar}`} />
            <div className="h-1.5 rounded-full bg-line/60" />
          </div>
        ))}
      </div>
      <div className="card flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-line/70" />
        <div className="flex-1 space-y-2">
          <div className={`h-4 w-28 ${bar}`} />
          <div className={`h-3.5 w-40 ${bar}`} />
        </div>
      </div>
      <div className="card">
        <div className={`h-5 w-20 ${bar}`} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-line/50" />
          ))}
        </div>
      </div>
    </div>
  )
}
