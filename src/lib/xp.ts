/**
 * 근무자 경험치·레벨 (1단계 · 사용자 요청 2026-11-06 "아르바이트에서 경험치를 모아서 캐릭터를 키우는 게임").
 * 따로 저장하지 않고 이미 있는 기록(출퇴근·서명·내 정보·후기)으로 계산 — DB를 바꾸지 않음.
 * 급여·확정에는 쓰지 않음 (재미용 기록일 뿐 · 관리자 화면에도 보이지 않음).
 * 점수는 현장에서 바라는 행동에 줌: 근무 완료, 정시 출근, 근무 종료 직접 누르기, 서류 서명, 정보 채우기, 후기
 */

export const XP_RULES = [
  { key: 'shift', label: '근무 1번 마치기', xp: 10 },
  { key: 'ontime', label: '정시 출근', xp: 5 },
  { key: 'selfOut', label: '종료 버튼 직접 누르기', xp: 5 },
  { key: 'sign', label: '서류 서명', xp: 3 },
  { key: 'review', label: '회사 후기 남기기', xp: 5 },
  { key: 'profile', label: '내 정보 다 채우기 (한 번)', xp: 20 },
] as const

/** 레벨이 오르는 경험치 (Lv.1 = 0부터) */
const LEVELS = [0, 30, 80, 150, 250, 400, 600, 850, 1150, 1500]

/** 레벨별 병아리 (public/stickers 의 병아리 이모티콘) */
const STAGES = [
  { from: 1, name: '새내기 병아리', img: '/stickers/hi.webp' },
  { from: 3, name: '부지런 병아리', img: '/stickers/cheer.webp' },
  { from: 5, name: '믿음직한 병아리', img: '/stickers/goodjob.webp' },
  { from: 7, name: '현장 에이스', img: '/stickers/welldone.webp' },
  { from: 9, name: '전설의 알바러', img: '/stickers/complete.webp' },
]

export type XpInput = {
  /** 근무 기록: 끝났는지 · 정시 출근인지 · 직접 종료했는지 */
  shifts: { done: boolean; onTime: boolean; selfOut: boolean }[]
  signedDocs: number
  reviews: number
  profileComplete: boolean
}

export type XpState = {
  xp: number
  level: number
  stage: { name: string; img: string }
  /** 이번 레벨 안에서 채운 비율 (0~1) · 최고 레벨이면 1 */
  progress: number
  /** 다음 레벨까지 남은 경험치 (최고 레벨이면 0) */
  toNext: number
  /** 다음 레벨까지 근무 몇 번 (근무 1번 = 정시·직접 종료 포함 20점으로 셈) */
  shiftsToNext: number
  counts: Record<(typeof XP_RULES)[number]['key'], number>
}

export function computeXp(i: XpInput): XpState {
  const done = i.shifts.filter((s) => s.done)
  const counts = {
    shift: done.length,
    ontime: done.filter((s) => s.onTime).length,
    selfOut: done.filter((s) => s.selfOut).length,
    sign: i.signedDocs,
    review: i.reviews,
    profile: i.profileComplete ? 1 : 0,
  }
  const xp = XP_RULES.reduce((n, r) => n + r.xp * counts[r.key], 0)
  let level = 1
  for (let l = 0; l < LEVELS.length; l++) if (xp >= LEVELS[l]) level = l + 1
  const cur = LEVELS[level - 1]
  const next = LEVELS[level] // 최고 레벨이면 undefined
  const progress = next == null ? 1 : (xp - cur) / (next - cur)
  const toNext = next == null ? 0 : next - xp
  const stage = [...STAGES].reverse().find((s) => level >= s.from) ?? STAGES[0]
  return { xp, level, stage: { name: stage.name, img: stage.img }, progress, toNext, shiftsToNext: Math.ceil(toNext / 20), counts }
}

/** 출퇴근 기록 한 건 → 점수 판단 (예정 시작 + 5분 안에 출근이면 정시 · 관리자·자동 종료가 아니면 직접 종료) */
export function shiftFacts(a: { clock_in: string; clock_out: string | null; note: string | null; source?: string | null }, plannedStart: Date | null): { done: boolean; onTime: boolean; selfOut: boolean } {
  const done = !!a.clock_out
  const onTime = !!plannedStart && Date.parse(a.clock_in) <= plannedStart.getTime() + 5 * 60_000
  const note = a.note ?? ''
  const selfOut = done && !/관리자|행사 종료|나중에 종료|귀가 조치/.test(note)
  return { done, onTime, selfOut }
}
