/** 비밀번호 6칸 점: 쓴 만큼 채워지고 6자리면 초록 (로그인·가입·명단 잠금이 같이 씀) */
export default function PinDots({ n }: { n: number }) {
  return (
    <span aria-hidden className="mb-1.5 flex shrink-0 gap-1" data-pin-dots={n}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={`size-2 rounded-full transition-colors duration-150 ${i < n ? `animate-pop ${n === 6 ? 'bg-emerald-500' : 'bg-brand-600'}` : 'bg-line'}`} />
      ))}
    </span>
  )
}
