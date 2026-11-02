import { stickerById } from '@/lib/stickers'

/** 이모티콘 한 개 (대화·고르기 화면). 예전 이모티콘(그림 없음)은 글자 말풍선으로 */
export default function Sticker({ id, size = 120 }: { id: string; size?: number }) {
  const s = stickerById(id)
  if (!s) return null
  if (!s.img)
    return (
      <span role="img" aria-label={`이모티콘: ${s.label}`} className="rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[15px] font-semibold text-amber-900 ring-1 ring-amber-200">
        🐥 {s.label}
      </span>
    )
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 작은 고정 그림이라 이미지 최적화 서버를 거치지 않음
    <img
      src={`/stickers/${s.id}.webp`}
      alt={`이모티콘: ${s.label}`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="select-none"
      style={{ width: size, height: size }}
    />
  )
}

/** 입력칸 옆 '이모티콘' 버튼 그림 (병아리 얼굴) */
export function StickerIcon({ size = 34 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- 위와 같음
  return <img src="/stickers/icon.webp" alt="" width={size} height={size} draggable={false} className="select-none rounded-full" />
}
