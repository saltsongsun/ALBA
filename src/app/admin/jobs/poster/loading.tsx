/** 공고 QR 화면을 여는 동안 (돌아가기 줄 · 가운데 QR 카드 — 공고 목록 모양이 아니라) */
export default function Loading() {
  const bar = 'rounded bg-line/70'
  return (
    <div aria-busy="true" aria-label="QR 불러오는 중" className="skeleton mx-auto max-w-md space-y-4" data-skeleton="poster">
      <div className={`h-4 w-20 ${bar}`} />
      <div className="card flex flex-col items-center gap-4">
        <div className="flex w-full flex-col items-center gap-2">
          <div className={`h-4 w-28 ${bar}`} />
          <div className={`h-7 w-56 max-w-full ${bar}`} />
          <div className={`h-3.5 w-4/5 ${bar}`} />
        </div>
        <div className="aspect-square w-full max-w-64 rounded-2xl bg-line/50" />
        <div className={`h-3 w-3/5 ${bar}`} />
      </div>
    </div>
  )
}
