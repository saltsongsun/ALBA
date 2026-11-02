/**
 * 해피워크 이모티콘: 파란 모자·앞치마를 한 노란 병아리 (그림: public/stickers/아이디.webp, 320px).
 * 대화에는 '::s:아이디::' 한 줄로 저장하고, 화면에서 그림으로 바꿔 보여 줌 (알림·내려받기에서는 [이모티콘] 글자로)
 */
export const STICKERS = [
  { id: 'hi', label: '안녕하세요' },
  { id: 'ok', label: '확인했어요' },
  { id: 'thanks', label: '감사합니다' },
  { id: 'goodjob', label: '수고하셨어요' },
  { id: 'wait', label: '잠시만요' },
  { id: 'sorry', label: '죄송해요' },
  { id: 'schedule', label: '스케줄 확인해주세요' },
  { id: 'retime', label: '시간 변경했어요' },
  { id: 'brief', label: '업무 전달드려요' },
  { id: 'complete', label: '처리 완료!' },
] as const

/** 예전 이모티콘 (이미 보낸 대화에 남아 있음): 그림 없이 글자로 보여 줌. 새로 보낼 수는 없음 */
const OLD: Record<string, string> = {
  arrived: '도착했어요',
  late: '조금 늦어요',
  fighting: '화이팅!',
  break: '쉬는 중',
  done: '퇴근!',
  question: '질문 있어요',
  love: '최고예요',
}

export type StickerId = (typeof STICKERS)[number]['id']
/** img: 그림이 있는 이모티콘인지 (예전 것은 false) */
export type StickerInfo = { id: string; label: string; img: boolean }

const TOKEN = /^::s:([a-z]+)::$/

export const stickerToken = (id: StickerId) => `::s:${id}::`

/** 아이디로 이모티콘 찾기 (예전 것 포함) */
export function stickerById(id: string): StickerInfo | null {
  const s = STICKERS.find((x) => x.id === id)
  if (s) return { ...s, img: true }
  return Object.hasOwn(OLD, id) ? { id, label: OLD[id], img: false } : null
}

/** 이 메시지가 이모티콘이면 그 이모티콘 */
export function stickerOf(body: string): StickerInfo | null {
  const m = TOKEN.exec(body.trim())
  return m ? stickerById(m[1]) : null
}

/** 이모티콘 모양으로 시작하는데 지금 보낼 수 있는 목록에 없는 것 (서버에서 거절) */
export const badSticker = (body: string) => body.trim().startsWith('::s:') && !stickerOf(body)?.img

/** 알림·목록 미리보기·내려받기용 글자 */
export function plainBody(body: string): string {
  const s = stickerOf(body)
  return s ? `[이모티콘] ${s.label}` : body
}
