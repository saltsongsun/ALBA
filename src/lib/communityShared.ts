/**
 * 커뮤니티 2단계 (사용자 요청 2026-11-21 "커뮤니티 2단계도 진행해줘")에서 화면·서버가 함께 쓰는 것:
 * 이모지 반응 다섯 가지 · 주간 랭킹 점수 규칙 · 출석 연속 기록 계산.
 * 브라우저에서도 쓰므로 서버 전용 코드 없음
 */

/** 이모지 반응 (DB에는 영어 열쇠로 저장) */
export const REACTIONS = [
  { key: 'laugh', emoji: '😂', label: '웃겨요' },
  { key: 'clap', emoji: '👏', label: '대단해요' },
  { key: 'wow', emoji: '😮', label: '놀라워요' },
  { key: 'sad', emoji: '😢', label: '슬퍼요' },
  { key: 'cheer', emoji: '💪', label: '힘내요' },
] as const
export type ReactionKey = (typeof REACTIONS)[number]['key']
export const isReaction = (v: unknown): v is ReactionKey => REACTIONS.some((r) => r.key === v)
export const reactionOf = (k: string) => REACTIONS.find((r) => r.key === k) ?? REACTIONS[0]

/** 투표 보기: 2~4개 · 한 보기 1~30자 */
export const POLL_MIN = 2
export const POLL_MAX = 4
export const POLL_LEN = 30

/**
 * 주간 랭킹 점수 (월요일마다 새로). 글·댓글은 한 주에 셀 수 있는 수가 정해져 있음 (도배로 점수 올리기 막기)
 */
export const RANK_POINTS = { checkin: 10, shift: 20, post: 5, comment: 2 } as const
export const RANK_CAPS = { post: 3, comment: 10 } as const
export function rankScore(s: { checkins: number; shifts: number; posts: number; comments: number }): number {
  return (
    s.checkins * RANK_POINTS.checkin +
    s.shifts * RANK_POINTS.shift +
    Math.min(s.posts, RANK_CAPS.post) * RANK_POINTS.post +
    Math.min(s.comments, RANK_CAPS.comment) * RANK_POINTS.comment
  )
}

const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 864e5)

/**
 * 출석 연속 기록: current = 오늘(오늘 아직 안 했으면 어제)까지 이어진 날 수 · best = 가장 길게 이어진 날 수.
 * 오늘 출석을 아직 안 했어도 어제까지 이어졌으면 끊긴 게 아님 (오늘 안에 하면 이어짐)
 */
export function streakOf(days: string[], today: string): { current: number; best: number; today: boolean } {
  const set = new Set(days.map(dayNum))
  const t = dayNum(today)
  const doneToday = set.has(t)
  let current = 0
  for (let d = doneToday ? t : t - 1; set.has(d); d--) current++
  let best = 0
  for (const d of set) {
    if (set.has(d - 1)) continue
    let n = 0
    while (set.has(d + n)) n++
    best = Math.max(best, n)
  }
  return { current, best, today: doneToday }
}
