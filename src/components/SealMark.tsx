/**
 * '(인)' 자리와 그 위에 겹쳐 찍는 직인. 직인은 항상 '(인)' 글자 한가운데에 찍힘
 * (예전처럼 줄 시작에서 고정 거리로 놓으면 대표자 이름 길이에 따라 엉뚱한 곳에 찍혀서).
 * 글자와 직인을 같은 칸에 겹쳐 놓아 직인 크기만큼 자리를 차지하고(옆 칸을 침범하지 않게), 위아래로는 줄 간격을 늘리지 않음
 */
export default function SealMark({ seal, size = 'md' }: { seal: string | null | undefined; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-20 -my-8' : 'size-16 -my-6'
  return (
    <span className="inline-grid place-items-center align-middle">
      <span className="text-mute [grid-area:1/1]">(인)</span>
      {seal && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={seal} alt="직인" className={`pointer-events-none ${box} object-contain mix-blend-multiply [grid-area:1/1]`} />
      )}
    </span>
  )
}
