import type { IconName } from '@/components/Icon'

/**
 * 문의 채팅으로 담당자가 보내는 '바로 가기 버튼' (예: 근무 시작 버튼을 못 찾는 근무자에게 '근무 시작하러 가기').
 * 메시지 글 안에 한 줄 '::b:이름::'으로 들어가고, 근무자 화면에서는 누르는 버튼으로 보임.
 * 갈 수 있는 곳은 아래 목록만 (주소를 직접 넣을 수 없음 · 모르는 이름은 서버가 거절)
 */
export type ChatButton = {
  key: string
  /** 버튼 글자 */
  label: string
  /** 근무자 앱 안의 주소 */
  href: string
  icon: IconName
  /** 입력칸이 비어 있을 때 버튼과 함께 보내는 한 줄 */
  lead: string
}

export const CHAT_BUTTONS: ChatButton[] = [
  { key: 'clock-in', label: '근무 시작하러 가기', href: '/me#clock', icon: 'clock', lead: '아래 버튼을 누르면 근무 시작 버튼이 있는 곳으로 바로 가요.' },
  { key: 'clock-out', label: '근무 종료하러 가기', href: '/me#clock', icon: 'clock', lead: '아래 버튼을 누르면 근무 종료 버튼이 있는 곳으로 바로 가요.' },
  { key: 'sign', label: '서류 서명하러 가기', href: '/me#sign-docs', icon: 'pen', lead: '서명할 서류가 있어요. 아래 버튼을 눌러 서명해 주세요.' },
  { key: 'account', label: '급여 계좌 등록하기', href: '/me/profile#bank_account', icon: 'card', lead: '급여를 보내 드리려면 계좌가 필요해요. 아래 버튼을 눌러 등록해 주세요.' },
  { key: 'photo', label: '얼굴 사진 올리기', href: '/me/profile#photo', icon: 'camera', lead: '현장에서 알아볼 수 있게 얼굴 사진을 올려 주세요.' },
  { key: 'push', label: '알림 켜기', href: '/me/profile#push', icon: 'bell', lead: '확정·전날 안내를 놓치지 않게 앱 알림을 켜 주세요.' },
  { key: 'history', label: '근무 내역·급여 보기', href: '/me/history', icon: 'receipt', lead: '근무 내역과 급여는 아래에서 볼 수 있어요.' },
  { key: 'jobs', label: '모집 중인 알바 보기', href: '/', icon: 'search', lead: '지금 모집 중인 공고는 아래에서 볼 수 있어요.' },
]

const BY_KEY = new Map(CHAT_BUTTONS.map((b) => [b.key, b]))
const KEY = '[a-z][a-z-]{0,19}'
// (보낸 글의 줄바꿈이 \r\n이어도 같게)
const ONE = new RegExp(`^[ \\t]*::b:(${KEY})::[ \\t\\r]*$`)
const LINES = new RegExp(`^[ \\t]*::b:${KEY}::[ \\t\\r]*$`, 'gm')
/** 메시지 하나에 버튼은 3개까지 */
export const MAX_BUTTONS = 3

export const buttonToken = (key: string) => `::b:${key}::`

/** 이 한 줄이 버튼이면 그 버튼 (목록에 없는 이름이면 null) */
export function chatButtonOf(line: string): ChatButton | null {
  const m = ONE.exec(line)
  return m ? (BY_KEY.get(m[1]) ?? null) : null
}

/** 글 안에 버튼 모양 줄이 있는지 (근무자는 버튼을 보낼 수 없음) */
export const hasButtonLine = (body: string) => body.split(/\r?\n/).some((l) => /^[ \t]*::b:/.test(l))

/** 서버에서 거절: 목록에 없는 버튼 · 버튼이 너무 많음 · 버튼만 있고 글이 없음 */
export function badButtons(body: string): boolean {
  const lines = body.split(/\r?\n/).filter((l) => /^[ \t]*::b:/.test(l))
  if (!lines.length) return false
  if (lines.length > MAX_BUTTONS || lines.some((l) => !chatButtonOf(l))) return true
  return !body.replace(LINES, '').trim()
}

/** 보여 줄 때: 글과 버튼을 나눔 (버튼 줄은 글에서 뺌) */
export function splitButtons(body: string): { text: string; buttons: ChatButton[] } {
  if (!body.includes('::b:')) return { text: body, buttons: [] }
  const buttons: ChatButton[] = []
  const text = body
    .split(/\r?\n/)
    .filter((l) => {
      const b = chatButtonOf(l)
      if (b) buttons.push(b)
      return !b
    })
    .join('\n')
    .trim()
  return { text, buttons }
}

/** 알림·목록 미리보기·내려받기용: 버튼 줄을 '[버튼] 근무 시작하러 가기'로 */
export const plainButtons = (body: string) => (body.includes('::b:') ? body.replace(LINES, (line) => (chatButtonOf(line) ? `[버튼] ${chatButtonOf(line)!.label}` : line)) : body)
