import { fmtDate, kstDate } from './time'

/**
 * 현장 상황 알림: 문의함 메시지(messages) 첫 줄 머리말로 종류를 구분해 화면에서 다시 읽음.
 * 스키마를 늘리지 않고 근무자·담당자 양쪽 문의함에 그대로 기록이 남게 함.
 */
/** 근무자 '오늘 근무 시간이 지났어요' → 담당자에게 알리기 (빠른 답장) · 관리자 문의 화면은 이 글로 시작하면 '기록 넣기' 바로 가기 */
export const ASK_MISSED = '오늘 출근했는데 근무 시작을 못 눌렀어요. 기록 부탁드려요.'
/** 근무자 '곧 시작인데 아직 확정 전이에요' → 담당자에게 문의 (빠른 답장) · 관리자 문의 화면은 이 글로 시작하면 '지원자 보기'와 답장 제안을 보여 줌 */
export const ASK_CONFIRM = '지원했는데 확정 여부가 궁금해요.'

export const SIGNAL = {
  late: '🕒 지각 알림', // 근무자 → 담당자: 늦어요
  arrive: '📍 출근 확인 요청', // 근무자 → 담당자: 현장인데 위치 확인이 안 돼요
  change: '🔔 일정 변경', // 담당자 → 확정자: 시간·장소 바뀜
  cancel: '❌ 행사 취소', // 담당자 → 확정자·지원자
  remind: '⏰ 내일 근무 안내', // 자동: 근무 전날
  coming: '🙋 출근 예정 확인', // 근무자 → 담당자: 전날 '내일 갈게요' (알리기만 — 안 읽음으로 쌓지 않음)
  paid: '💸 급여 지급', // 담당자 → 근무자
  payday: '💰 정산 예정일', // 담당자·자동(행사 종료) → 근무자: 언제 들어오는지
  account: '💳 계좌 등록 요청', // 담당자 → 근무자
  fix: '✏️ 기록 정정 요청', // 근무자 → 담당자: 출근·종료 시각이 잘못 찍힘
  fixDone: '✅ 기록 정정', // 담당자 → 근무자: 요청대로 고침
  fixNo: '↩️ 기록 정정 안 함', // 담당자 → 근무자: 그대로 둠
} as const

export type SignalKind = keyof typeof SIGNAL

export function signalOf(body: string): SignalKind | null {
  const head = body.split('\n', 1)[0]
  for (const [k, v] of Object.entries(SIGNAL)) if (head.startsWith(v)) return k as SignalKind
  return null
}

/**
 * 관리자 문의 목록: 근무자가 마지막으로 보낸 글이 답장을 기다리는 글인지.
 * 알리기만 하는 글(지각 알림 · 근무일/확정 취소 알림 · 늦은 종료 입력)은 답장이 없어도 되므로 뺌
 */
export function needsReply(body: string): boolean {
  const head = body.split('\n', 1)[0]
  return !(head.startsWith(SIGNAL.late) || head.startsWith(SIGNAL.coming) || head.startsWith('⚠️') || head.startsWith('🕒 근무 종료 늦게 입력'))
}

/** 관리자 문의 목록의 짧은 표시: 바로 처리할 요청 종류 (일반 문의면 null) · urgent = 현장에서 지금 기다리는 것 */
export function askTag(body: string): { label: string; urgent: boolean } | null {
  const head = body.split('\n', 1)[0]
  if (head.startsWith(SIGNAL.arrive)) return { label: '출근 확인', urgent: true }
  if (head.startsWith(ASK_MISSED.slice(0, 20))) return { label: '출근 기록', urgent: true }
  if (head.startsWith(SIGNAL.fix)) return { label: '기록 정정', urgent: false }
  if (head.startsWith(ASK_CONFIRM.slice(0, 12))) return { label: '확정 문의', urgent: false }
  return null
}

/** 전날 '내일 갈게요' 글 (근무일 date에 대한 것인지는 본문의 날짜로 봄) */
export const comingBody = (title: string, date: string, start: string) => `${SIGNAL.coming}\n${title} · ${fmtDate(date)} ${start} · 시간 맞춰 갈게요.`
export const isComing = (body: string, date: string) => signalOf(body) === 'coming' && body.includes(`· ${fmtDate(date)} `)

/** 지각 알림 본문에서 늦는 분과 도착 예정 시각 */
export function parseLate(body: string): { minutes: number; eta: string } | null {
  const m = body.match(/약 (\d+)분 늦어요 \(도착 예정 (\d{2}:\d{2})\)/)
  return m ? { minutes: Number(m[1]), eta: m[2] } : null
}

/** 출근 확인 요청 본문에서 행사장까지 거리(m, 모르면 null) */
export function parseArriveDistance(body: string): number | null {
  const m = body.match(/약 ([\d,]+)m/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

/** 불성실 근무자 귀가 조치: 근무 기록 메모의 머리말과 고를 수 있는 사유 (근로계약서 '근로계약의 해지' 조항과 같게) */
export const DISMISS_NOTE = '귀가 조치'
export const DISMISS_REASONS = ['무단 이탈', '업무 지시 반복 거부', '음주', '폭언·폭행·성희롱', '안전수칙 위반', '근무 태만', '기타'] as const

/**
 * 일찍 끝났지만 근로조건(예정 종료 시각)대로 시간을 인정해 달라는 요청 (사용자 요청 2026-11-07).
 * 기록 정정 요청(fix)과 같은 흐름을 그대로 씀 — '실제 종료'를 예정 종료 시각으로 두고 사유 줄에 이 말을 넣음.
 * 관리자가 승인하면 종료 시각을 예정 종료 시각으로 보정(adj_out) → 정산에 근로조건대로 들어감
 */
export const FULL_TIME_MARK = '일찍 끝났지만 근로조건대로 시간 인정 요청'
export const isFullTimeAsk = (body: string) => body.includes(FULL_TIME_MARK)

/** 기록 정정 요청 본문에서 고칠 항목(출근·종료)과 실제 시각 */
export function parseFix(body: string): { field: 'in' | 'out'; time: string } | null {
  const m = body.match(/실제 (출근|종료) (\d{2}:\d{2})/)
  return m ? { field: m[1] === '출근' ? 'in' : 'out', time: m[2] } : null
}

/**
 * 그날(date) 근무에 대해 아직 답하지 않은 정정 요청 (가장 최근 것).
 * 그 뒤에 담당자가 이날 근무에 대해 고침·그대로 둠으로 답했으면 없음
 */
export function pendingFix<T extends { body: string; created_at: string; from_admin: boolean }>(msgs: T[], date: string): T | null {
  const day = fmtDate(date)
  for (const m of [...msgs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const kind = signalOf(m.body)
    if (m.from_admin && (kind === 'fixDone' || kind === 'fixNo') && m.body.includes(day)) return null
    if (!m.from_admin && kind === 'fix' && kstDate(m.created_at) === date && parseFix(m.body)) return m
  }
  return null
}

/** 정정 요청한 시각을 그날 날짜에 맞춰 실제 시각으로 (종료가 출근보다 앞이면 자정을 넘긴 것) */
export function fixTime(date: string, fix: { field: 'in' | 'out'; time: string }, inAt: Date): Date {
  const t = new Date(`${date}T${fix.time}:00+09:00`)
  return fix.field === 'out' && t <= inAt ? new Date(t.getTime() + 86_400_000) : t
}

/** 정산 예정일 안내 본문에서 예정일 글자 ('정산 예정일: 11/14(금)' → '11/14(금)') */
export function parsePayday(body: string): string | null {
  return body.match(/정산 예정일: ([^\n]+)/)?.[1]?.trim() ?? null
}
