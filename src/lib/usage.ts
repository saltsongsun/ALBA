/**
 * 화면 이동 기록(자체 분석)에서 쓰는 이름표·모양 정리 — 서버·화면 모두에서 씀
 */

/** 주소에서 번호·id를 빼고 화면 모양만: /jobs/1234-… → /jobs/[id] (쿼리·# 뺌) */
export function screenOf(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.length > 300) return null
  const path = raw.split(/[?#]/)[0]
  if (/^\/(api|_next)(\/|$)/.test(path)) return null
  const parts = path
    .split('/')
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? '[id]' : /^\d+$/.test(s) ? '[n]' : s.length > 40 || !/^[a-z0-9._-]+$/i.test(s) ? '[x]' : s.toLowerCase()))
  return `/${parts.join('/')}`
}

export const AGE_BANDS = ['10대', '20대', '30대', '40대', '50대 이상'] as const

/** 생년월일 → 나이대 (만 나이) */
export function ageBand(birth: string | null | undefined, now = new Date()): string | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}/.test(birth)) return null
  const [y, m, d] = birth.slice(0, 10).split('-').map(Number)
  const kst = new Date(now.getTime() + 9 * 3600e3)
  let age = kst.getUTCFullYear() - y
  if (kst.getUTCMonth() + 1 < m || (kst.getUTCMonth() + 1 === m && kst.getUTCDate() < d)) age--
  if (age < 10 || age > 100) return null
  if (age < 20) return '10대'
  if (age < 30) return '20대'
  if (age < 40) return '30대'
  if (age < 50) return '40대'
  return '50대 이상'
}

export const ROLE_LABEL: Record<string, string> = { worker: '근로자', expert: '전문가', vendor: '외주 업체', admin: '관리자', guest: '비회원' }
export const GENDER_LABEL: Record<string, string> = { M: '남자', F: '여자' }

/** 화면 이름 (모르는 화면은 모양 그대로) */
const SCREEN: Record<string, string> = {
  '/': '홈 · 알바 찾기',
  '/jobs/[id]': '공고 보기',
  '/me': '내 근무',
  '/me/profile': '내 정보',
  '/me/history': '지난 근무',
  '/me/chat': '문의 목록',
  '/me/chat/room/[id]': '단체방',
  '/me/calendar/[id]': '달력에 넣기',
  '/me/review/[id]': '후기 쓰기',
  '/docs/[id]': '서류 보기·서명',
  '/community': '커뮤니티',
  '/community/[id]': '커뮤니티 글',
  '/community/new': '커뮤니티 글쓰기',
  '/community/coworkers': '동료',
  '/pro': '전문가 의뢰',
  '/login': '로그인',
  '/signup': '가입',
  '/start': '시작하기',
  '/admin': '대시보드',
  '/admin/jobs': '공고 목록',
  '/admin/jobs/new': '공고 등록',
  '/admin/jobs/[id]': '공고 관리',
  '/admin/jobs/[id]/edit': '공고 수정',
  '/admin/workers': '근무자 명단',
  '/admin/workers/[id]': '근무자 상세',
  '/admin/chat': '문의 (관리자)',
  '/admin/chat/[id]': '1:1 문의 (관리자)',
  '/admin/chat/room/[id]': '단체방 (관리자)',
  '/admin/docs': '서류 (관리자)',
  '/admin/reports': '정산 · 신고',
  '/admin/settings': '회사 설정',
  '/admin/vendors': '외주',
  '/admin/insights': '인사이트',
}
export const screenName = (p: string) => SCREEN[p] ?? p

/** 버튼 이름·오류 안내 등 행동 이름표 다듬기 (서버에서 한 번 더): 숫자는 #, 한 줄, 40자까지 */
export function cleanEventLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw
    .replace(/\s+/g, ' ')
    .replace(/\d/g, '#')
    .replace(/[^\p{L}\p{N}#\s·:/()'?!.,~\[\]_=›-]/gu, '')
    .trim()
    .slice(0, 40)
  return s || null
}
