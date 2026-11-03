import type { StickerId } from '@/lib/stickers'

/**
 * 목록이 비었을 때: 둥실 떠 있는 그림과 안내.
 * sticker를 주면 이모티콘 병아리 그림으로 (그림 속 글자가 안내와 어울리는 것만 골라 씀)
 */
export default function Empty({ icon, sticker, title, children }: { icon: string; sticker?: StickerId; title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center py-10 text-center" data-empty={sticker ?? undefined}>
      {sticker ? (
        // eslint-disable-next-line @next/next/no-img-element -- 작은 고정 그림
        <img src={`/stickers/${sticker}.webp`} alt="" aria-hidden width={112} height={112} className="mb-2 animate-float select-none" draggable={false} />
      ) : (
        <span aria-hidden className="mb-3 animate-float text-4xl">
          {icon}
        </span>
      )}
      <p className="font-semibold text-sub">{title}</p>
      {children && <div className="mt-1.5 text-sm text-mute">{children}</div>}
    </div>
  )
}
