/** 화면을 불러오는 동안 보여 주는 회색 자리 (내용이 들어올 자리 모양) */
export default function Skeleton({ cards = 3, hero = false }: { cards?: number; hero?: boolean }) {
  return (
    <div aria-busy="true" aria-label="불러오는 중" className="animate-pulse space-y-4">
      {hero && <div className="h-36 rounded-3xl bg-line/70" />}
      <div className="h-6 w-40 rounded-lg bg-line/70" />
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="card space-y-3">
          <div className="h-4 w-24 rounded bg-line/70" />
          <div className="h-5 w-3/4 rounded bg-line/70" />
          <div className="h-4 w-1/2 rounded bg-line/60" />
        </div>
      ))}
    </div>
  )
}
