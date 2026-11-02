/**
 * 해피워크 이모티콘: 노란 스태프 모자를 쓴 파란 캐릭터 '해피'.
 * 대화에는 '::s:아이디::' 한 줄로 저장하고, 화면에서 그림으로 바꿔 보여 줌 (알림·내려받기에서는 [이모티콘] 글자로)
 */
export const STICKERS = [
  { id: 'hi', label: '안녕하세요' },
  { id: 'arrived', label: '도착했어요' },
  { id: 'late', label: '조금 늦어요' },
  { id: 'ok', label: '확인했어요' },
  { id: 'fighting', label: '화이팅!' },
  { id: 'thanks', label: '감사합니다' },
  { id: 'goodjob', label: '수고하셨어요' },
  { id: 'break', label: '쉬는 중' },
  { id: 'done', label: '퇴근!' },
  { id: 'sorry', label: '죄송해요' },
  { id: 'question', label: '질문 있어요' },
  { id: 'love', label: '최고예요' },
] as const

export type StickerId = (typeof STICKERS)[number]['id']
export type StickerInfo = (typeof STICKERS)[number]

const TOKEN = /^::s:([a-z]+)::$/

export const stickerToken = (id: StickerId) => `::s:${id}::`

/** 이 메시지가 이모티콘이면 그 이모티콘 */
export function stickerOf(body: string): StickerInfo | null {
  const m = TOKEN.exec(body.trim())
  return (m && STICKERS.find((s) => s.id === m[1])) || null
}

/** 이모티콘 모양으로 시작하는데 목록에 없는 것 (서버에서 거절) */
export const badSticker = (body: string) => body.trim().startsWith('::s:') && !stickerOf(body)

/** 알림·목록 미리보기·내려받기용 글자 */
export function plainBody(body: string): string {
  const s = stickerOf(body)
  return s ? `[이모티콘] ${s.label}` : body
}
