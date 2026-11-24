import { fmtDate, kstDate } from './time'

/**
 * 현장 상황 알림: 문의함 메시지(messages) 첫 줄 머리말로 종류를 구분해 화면에서 다시 읽음.
 * 스키마를 늘리지 않고 근무자·담당자 양쪽 문의함에 그대로 기록이 남게 함.
 */
/** 근무자 '오늘 근무 시간이 지났어요' → 담당자에게 알리기 (빠른 답장) · 관리자 문의 화면은 이 글로 시작하면 '기록 넣기' 바로 가기 */
export const ASK_MISSED = '오늘 출근했는데 근무 시작을 못 눌렀어요. 기록 부탁드려요.'
/** 근무자 '곧 시작인데 아직 확정 전이에요' → 담당자에게 문의 (빠른 답장) · 관리자 문의 화면은 이 글로 시작하면 '지원자 보기'와 답장 제안을 보여 줌 */
export const ASK_CONFIRM = '지원했는데 확정 여부가 궁금해요.'
/**
 * 외주 업체 '세금계산서를 보냈어요' → 그 회사 문의함 (빠른 답장 · 대금 이름·금액이 뒤에 붙음)
 * 관리자 문의 화면은 이 글로 시작하면 그 대금의 '계산서 받음' 버튼을 바로 보여 줌 (업체마다 계산서 받았는지 일일이 묻지 않게)
 */
export const ASK_INVOICE = '세금계산서를 보냈어요.'
/** 외주 업체: 지급일이 지난 대금 물어보기 (뒤에 대금 표시 · 지급 예정일) */
export const ASK_PAYDUE = '대금 지급일이 지났어요. 확인 부탁드려요.'
/** 근무자 '지난 근무'에서 약속한 정산일이 지난 입금 대기 → 그 회사 담당자에게 (문의함에 '급여 문의' 표시 · 사과 답장 제안) */
export const ASK_PAYLATE = '정산일이 지났는데 급여가 아직 안 들어왔어요. 확인 부탁드려요.'
/**
 * 근무자 명세서·확인서에서 '종료 기록이 없는 날'(그날은 계산에서 빠짐) → 그 공고 회사 담당자에게 (뒤에 날짜가 붙음 · 문의함 '종료 기록' 표시)
 * 정기 개선 2026-11-22 23:35
 */
export const ASK_NOEND = '근무 종료 기록이 빠진 날이 있어요. 확인 부탁드려요.'
/**
 * 근무자 공고 화면 '서명할 서류를 곧 보내 드려요'(보낼 때가 지났는데 아직 없음) → 그 공고 회사 담당자에게
 * (문의함 '서류 요청' 표시 · 서류 탭 '지금 보내기'로) — 정기 개선 2026-11-25 06:35
 */
export const ASK_DOCS = '확정됐는데 서명할 서류를 아직 못 받았어요. 확인 부탁드려요.'
export const isDocsAsk = (body: string) => body.startsWith(ASK_DOCS.slice(0, 14))
export const isNoEndAsk = (body: string) => body.startsWith(ASK_NOEND.slice(0, 14))
/** 근무자의 '정산일 지남' 급여 문의인지 (앞부분만 보고 · 뒤에 말을 덧붙여도) */
export const isPayLateAsk = (body: string) => body.startsWith(ASK_PAYLATE.slice(0, 12))
/**
 * 급여 문의 뒤에 그 공고 급여를 '💸 급여 지급'으로 알렸으면 답한 것으로 — 지급하고 나서도 문의함·홈 '답장 전'에 남지 않게.
 * 문의한 공고를 모르면(공고 없이 보낸 글) 어느 공고 지급이든
 */
export function paidAfterAsk(
  ask: { from_admin: boolean; body: string; created_at: string; job_id?: string | null },
  msgs: readonly { from_admin: boolean; body: string; created_at: string; job_id?: string | null }[],
): boolean {
  if (ask.from_admin || !isPayLateAsk(ask.body)) return false
  return msgs.some((m) => m.from_admin && m.body.startsWith(SIGNAL.paid) && m.created_at > ask.created_at && (!ask.job_id || !m.job_id || m.job_id === ask.job_id))
}
/** 위 문구 뒤에 붙는 대금 표시 ('개막식 음향 · 1,500,000원') */
export const invoiceTag = (title: string, amountText: string) => `${title} · ${amountText}`

/** 담당자 → 서명 안 한 확정자: 서류 탭 '앱 알림' 첫 줄 (서류 탭에서 마지막으로 보낸 때를 다시 읽음) */
export const SIGN_NUDGE = '✍️ 서류 서명 요청'

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

/** 지원 결과가 늦어질 때 자동으로 가는 정중한 안내의 첫 줄 (lib/waitNote) */
export const WAIT_HEAD = '🙏 지원 결과 안내'

/**
 * 우리(회사·앱)가 자동으로 또는 여럿에게 한꺼번에 보내는 안내의 첫 줄 (확정·미선발·정산일·출퇴근 확인·새 모집·공지 등).
 * 관리자 문의 목록에서는 이런 안내만 있는 대화를 아래에 접어 두고, 사람이 직접 쓴 대화를 위로 (사용자 요청 2026-11-16
 * "문의가 너무 많으니까 우리가 자동으로 보낸거는 띄우지 말고 직접친거를 위로")
 */
const AUTO_HEADS: readonly string[] = [
  SIGNAL.change,
  SIGNAL.cancel,
  SIGNAL.remind,
  SIGNAL.paid,
  SIGNAL.payday,
  SIGNAL.account,
  SIGNAL.fixDone,
  SIGNAL.fixNo,
  SIGN_NUDGE,
  '✅ 근무가 확정됐어요',
  '✅ 의뢰가 확정됐어요',
  '✅ 출근 처리됐어요',
  '🙏 이번엔 함께하지 못해요',
  WAIT_HEAD,
  '↩️ 근무 확정이 취소됐어요',
  '🏠 귀가 조치 안내',
  '🏁 행사가 끝났어요',
  '🏁 근무 종료를 눌러 주세요',
  '🏁 근무 종료로 기록했어요',
  '🏁 근무 종료 확인',
  '⏰ 근무 종료 확인',
  '⏰ 출근 확인',
  '📝 ',
  '📣 새 모집',
  '📢 공지',
]

/** 출근 처리 안내 첫 줄 (출근 확인 요청 처리 · 여러 명 출근 처리) */
export const ARRIVE_OK = '✅ 출근 처리됐어요'

/**
 * 근무자 요청(기록 정정 · 출근 확인)에 담당자가 버튼으로 답해 간 결과 안내.
 * 대화 화면에서는 자동 안내처럼 한 줄로 작게 보이지만, 문의함·홈 '답장 전'에서는 답한 것으로 셈 (버튼으로 처리했는데 계속 '답장 전'으로 남지 않게)
 */
export function isRequestAnswer(m: { from_admin: boolean; body: string }): boolean {
  if (!m.from_admin) return false
  const head = m.body.split('\n', 1)[0]
  if (head.startsWith(SIGNAL.fixDone) || head.startsWith(SIGNAL.fixNo)) return true
  // 출근 확인 요청을 처리한 답 ('…HH:MM 출근으로 기록했어요') — 여러 명을 한꺼번에 출근 처리한 안내('근무 시작으로 기록했어요')는 빼고
  return head.startsWith(ARRIVE_OK) && m.body.includes('출근으로 기록했어요')
}

/** 문의함 줄 세우기·답장 여부에서 빼는 안내 (자동 안내 중 요청에 대한 답은 뺌) */
export const isQuietNotice = (m: { from_admin: boolean; body: string }) => isAutoNotice(m) && !isRequestAnswer(m)

/** 우리가 자동으로·한꺼번에 보낸 안내인지 (근무자가 쓴 글·담당자가 직접 쓴 답장은 아님) */
export function isAutoNotice(m: { from_admin: boolean; body: string }): boolean {
  if (!m.from_admin) return false
  const head = m.body.split('\n', 1)[0]
  return AUTO_HEADS.some((h) => head.startsWith(h))
}

export function signalOf(body: string): SignalKind | null {
  const head = body.split('\n', 1)[0]
  for (const [k, v] of Object.entries(SIGNAL)) if (head.startsWith(v)) return k as SignalKind
  return null
}

/**
 * '🔔 일정 변경' 알림에서 무엇이 어떻게 바뀌었는지 (근무자 예정 카드에 바로 보여 줌)
 * - 공고 수정 알림 줄: '시간: 09:00~18:00 → 10:00~19:00'
 * - 근무시간 변경 요청: '… 근무시간이 09:00~18:00 → 10:00~19:00으로 바뀌었어요.'
 */
export function parseChanges(body: string): { label: string; from: string; to: string }[] {
  const out: { label: string; from: string; to: string }[] = []
  for (const line of body.split('\n').slice(1)) {
    const m = line.match(/^(날짜|시간|장소|집결|급여|복장|준비물): (.+) → (.+)$/)
    if (m) out.push({ label: m[1], from: m[2], to: m[3] })
    const t = line.match(/근무시간이 (\S+) → (\S+?)으로 바뀌었어요/)
    if (t) out.push({ label: '시간', from: t[1], to: t[2] })
  }
  return out
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
  if (isNoEndAsk(head)) return { label: '종료 기록', urgent: false }
  if (head.startsWith(ASK_CONFIRM.slice(0, 12))) return { label: '확정 문의', urgent: false }
  if (isDocsAsk(head)) return { label: '서류 요청', urgent: false }
  if (head.startsWith(ASK_INVOICE)) return { label: '계산서', urgent: false }
  if (head.startsWith(ASK_PAYDUE)) return { label: '대금 문의', urgent: false }
  if (isPayLateAsk(head)) return { label: '급여 문의', urgent: true }
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

/** 기록 정정 요청은 최근 며칠 근무까지 보낼 수 있음 (오늘 포함 · 지급 전 · 종료 기록이 있는 날) */
export const FIX_DAYS = 3
/** 정정 요청 본문의 근무 날 줄 ('공고 · 11/14(토) 근무') — 어느 날 근무에 대한 요청인지 이 글자로 찾음 */
export const fixDayTag = (date: string) => `· ${fmtDate(date)} 근무`

/**
 * 정정 요청이 어느 날 근무에 대한 것인지 (본문의 'M/D(요일) 근무' · 연도는 보낸 날에 맞춤, 연말·연초 넘어가는 것 고려).
 * 못 찾으면 보낸 날
 */
export function fixDateOf(body: string, sentAt: string): string {
  const sent = kstDate(sentAt)
  const x = body.match(/· (\d{1,2})\/(\d{1,2})\([^)]*\) 근무/)
  if (!x) return sent
  const mo = Number(x[1])
  const sentMo = Number(sent.slice(5, 7))
  const y = Number(sent.slice(0, 4)) + (mo > sentMo + 6 ? -1 : mo < sentMo - 6 ? 1 : 0)
  return `${y}-${String(mo).padStart(2, '0')}-${String(Number(x[2])).padStart(2, '0')}`
}

/**
 * 그날(date) 근무에 대해 아직 답하지 않은 정정 요청 (가장 최근 것).
 * 그 뒤에 담당자가 이날 근무에 대해 고침·그대로 둠으로 답했으면 없음.
 * 요청은 본문의 근무 날로 찾음 (지난 근무를 다음 날 요청해도 그날 근무의 요청)
 */
export function pendingFix<T extends { body: string; created_at: string; from_admin: boolean }>(msgs: T[], date: string): T | null {
  const day = fmtDate(date)
  for (const m of [...msgs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const kind = signalOf(m.body)
    if (m.from_admin && (kind === 'fixDone' || kind === 'fixNo') && m.body.includes(day)) return null
    if (!m.from_admin && kind === 'fix' && fixDateOf(m.body, m.created_at) === date && parseFix(m.body)) return m
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
