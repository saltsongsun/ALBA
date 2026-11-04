import mousePack from '../../public/stickers/working-mouse-21/pack.json'

/**
 * 해피워크 이모티콘 (대화·커뮤니티에서 쓰는 그림. 메뉴·시스템 아이콘은 components/Icon.tsx 선 아이콘).
 * 팩 두 개: ① 일하는 쥐돌이 21종 (기본, 작은 꼬리·회색 털·노란 작업모자·남색 작업복 — public/stickers/working-mouse-21/pack.json)
 *          ② 병아리 22종 (처음 팩, 파란 모자·앞치마 — public/stickers/아이디.webp)
 * 저장은 '::s:아이디::' 한 줄. 화면에서 그림으로 바꿔 보여 주고, 알림·목록 미리보기·내려받기에서는 '[이모티콘] 문구' 글자로.
 * 이미 보낸 병아리·예전 이모티콘도 그대로 다시 보임
 */
export type StickerItem = {
  id: string
  label: string
  /** 대화·글에 크게 보여 줄 그림 */
  src: string
  /** 고르기 화면용 작은 그림 */
  thumb: string
  category?: string
}
export type StickerPack = { id: string; name: string; thumb: string; items: StickerItem[] }

/** ① 일하는 쥐돌이: pack.json 그대로 (512px 그림 · 128px 작은 그림) */
const MOUSE: StickerPack = {
  id: mousePack.id,
  name: mousePack.name,
  thumb: mousePack.thumbnail,
  items: mousePack.items.map((it) => ({ id: it.id, label: it.label, category: it.category, src: it.src, thumb: it.thumbnail })),
}

/** ② 병아리 (320px webp 하나로 크게·작게 모두) */
const CHICK_ITEMS = [
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
  { id: 'yes', label: '네! 좋아요' },
  { id: 'please', label: '부탁드려요' },
  { id: 'cheer', label: '오늘도 파이팅!' },
  { id: 'checking', label: '일정 확인 중' },
  { id: 'later', label: '확인 후 알려드릴게요' },
  { id: 'help', label: '도와주세요' },
  { id: 'cover', label: '대신 근무할게요' },
  { id: 'rest', label: '쉬고 오세요' },
  { id: 'tired', label: '힘들어요' },
  { id: 'paid', label: '급여 지급했어요' },
  { id: 'payday', label: '급여 들어왔다!' },
  { id: 'welldone', label: '수고 많았어요!' },
] as const
const CHICK: StickerPack = {
  id: 'chick',
  name: '병아리',
  thumb: '/stickers/hi.webp',
  items: CHICK_ITEMS.map((s) => ({ id: s.id, label: s.label, src: `/stickers/${s.id}.webp`, thumb: `/stickers/${s.id}.webp` })),
}

/** 고르기 화면의 팩 순서 (맨 앞이 기본으로 열리는 팩) */
export const PACKS: StickerPack[] = [MOUSE, CHICK]
export const DEFAULT_PACK = MOUSE.id

/** 빈 화면 그림 등에 쓰는 병아리 아이디 (components/Empty.tsx) */
export type StickerId = (typeof CHICK_ITEMS)[number]['id']

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

/** img: 그림이 있는(지금 보낼 수 있는) 이모티콘인지 (예전 것은 false) */
export type StickerInfo = { id: string; label: string; img: boolean; src: string | null; pack: string | null }

const BY_ID = new Map(PACKS.flatMap((p) => p.items.map((it) => [it.id, { it, pack: p.id }] as const)))

/** 아이디 모양: 영문 소문자·숫자·붙임표 (예: hi, working-mouse-21) */
const ID = '[a-z][a-z0-9-]{0,39}'
const TOKEN = new RegExp(`^::s:(${ID})::$`)
/** 글 안에서 이모티콘만 있는 한 줄 */
const TOKEN_LINE = new RegExp(`^[ \\t]*::s:${ID}::[ \\t]*$`, 'gm')

export const stickerToken = (id: string) => `::s:${id}::`

/** 아이디로 이모티콘 찾기 (예전 것 포함) */
export function stickerById(id: string): StickerInfo | null {
  const hit = BY_ID.get(id)
  if (hit) return { id, label: hit.it.label, img: true, src: hit.it.src, pack: hit.pack }
  return Object.hasOwn(OLD, id) ? { id, label: OLD[id], img: false, src: null, pack: null } : null
}

/** 이 메시지(한 줄 전체)가 이모티콘이면 그 이모티콘 */
export function stickerOf(body: string): StickerInfo | null {
  const m = TOKEN.exec(body.trim())
  return m ? stickerById(m[1]) : null
}

/** 지금 보낼 수 있는 이모티콘 아이디인지 (글·댓글의 '이모티콘 넣기' 칸 확인용) */
export const sendable = (id: string) => BY_ID.has(id)

/** 이모티콘 모양으로 시작하는데 지금 보낼 수 있는 목록에 없는 것 (서버에서 거절) */
export const badSticker = (body: string) => body.trim().startsWith('::s:') && !stickerOf(body)?.img

/** 알림·목록 미리보기·내려받기용 글자 (글 안의 이모티콘 줄도 '[이모티콘] 문구'로) */
export function plainBody(body: string): string {
  const s = stickerOf(body)
  if (s) return `[이모티콘] ${s.label}`
  return body.replace(TOKEN_LINE, (line) => {
    const t = stickerOf(line)
    return t ? `[이모티콘] ${t.label}` : line
  })
}

/**
 * 커뮤니티 글: 내용과 붙인 이모티콘(맨 끝 한 줄)을 나눔. 글을 고칠 때·보여 줄 때 씀.
 * 직접 써 넣은 이모티콘 모양 줄은 내용에서 빼 버림 (이모티콘은 '이모티콘 넣기'로 하나만)
 */
export function splitPostBody(body: string): { text: string; sticker: StickerInfo | null } {
  const lines = body.replace(/\s+$/, '').split('\n')
  const last = lines.at(-1) ?? ''
  const st = stickerOf(last)
  const text = (st ? lines.slice(0, -1).join('\n') : body).replace(TOKEN_LINE, '').trim()
  return { text, sticker: st?.img ? st : null }
}

/** 커뮤니티 글 저장: 내용 + (고른 이모티콘이 있으면) 맨 끝 한 줄 */
export const joinPostBody = (text: string, stickerId: string | null) => (stickerId ? `${text}\n\n${stickerToken(stickerId)}` : text)
