/**
 * 현장 상황 알림: 문의함 메시지(messages) 첫 줄 머리말로 종류를 구분해 화면에서 다시 읽음.
 * 스키마를 늘리지 않고 근무자·담당자 양쪽 문의함에 그대로 기록이 남게 함.
 */
export const SIGNAL = {
  late: '🕒 지각 알림', // 근무자 → 담당자: 늦어요
  arrive: '📍 출근 확인 요청', // 근무자 → 담당자: 현장인데 위치 확인이 안 돼요
  change: '🔔 일정 변경', // 담당자 → 확정자: 시간·장소 바뀜
  cancel: '❌ 행사 취소', // 담당자 → 확정자·지원자
  remind: '⏰ 내일 근무 안내', // 자동: 근무 전날
  paid: '💸 급여 지급', // 담당자 → 근무자
  account: '💳 계좌 등록 요청', // 담당자 → 근무자
} as const

export type SignalKind = keyof typeof SIGNAL

export function signalOf(body: string): SignalKind | null {
  const head = body.split('\n', 1)[0]
  for (const [k, v] of Object.entries(SIGNAL)) if (head.startsWith(v)) return k as SignalKind
  return null
}

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
