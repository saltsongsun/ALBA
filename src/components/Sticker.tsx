import { stickerById } from '@/lib/stickers'

/**
 * 이모티콘 한 개 (대화·커뮤니티 글·댓글). 쥐돌이는 512px 그림을 작게 줄여 또렷하게, 병아리는 320px 그림.
 * 예전 이모티콘(그림 없음)은 글자 말풍선으로
 */
export default function Sticker({ id, size = 120 }: { id: string; size?: number }) {
  const s = stickerById(id)
  if (!s) return null
  if (!s.img || !s.src)
    return (
      <span role="img" aria-label={`이모티콘: ${s.label}`} className="rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[15px] font-semibold text-amber-900 ring-1 ring-amber-200">
        🐥 {s.label}
      </span>
    )
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 고정 그림이라 이미지 최적화 서버를 거치지 않음 (투명 PNG 그대로)
    <img
      src={s.src}
      alt={`이모티콘: ${s.label}`}
      title={s.label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      data-sticker={s.id}
      className="select-none"
      style={{ width: size, height: size }}
    />
  )
}
