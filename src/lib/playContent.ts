/**
 * 놀이터(커뮤니티 > 놀이터)에 쓰는 내용: 배지 · 이번 주 챌린지 · 알바 상식 퀴즈 · 오늘의 운세
 * (사용자 요청 2026-11-20 "게임과 커뮤니티 기능을 많이 추가해줘 구인구직자들이 즐길 수 있도록").
 * 모두 이미 있는 기록으로 계산하거나 화면 안에서만 쓰는 재미용 — DB를 바꾸지 않고, 급여·확정에는 쓰지 않음.
 * 이 파일은 화면(브라우저)에서도 씀 → 서버 전용 코드 없음
 */

export type PlayStats = {
  /** 마친 근무 수 · 정시 출근 수 · 종료를 직접 누른 수 */
  shifts: number
  onTime: number
  selfOut: number
  /** 일한 회사 수 (출근 기록 기준) */
  companies: number
  signed: number
  reviews: number
  posts: number
  comments: number
  likesGot: number
  /** 서로 맺은 동료 수 */
  coworkers: number
  profileDone: boolean
  /** 이번 주(월~일) 기록 */
  week: { shifts: number; onTime: number; talk: number }
}

export type Badge = { key: string; icon: string; name: string; goal: string; have: number; need: number }

/** 배지: 이미 있는 기록으로 판단 (have ≥ need 이면 얻음) */
export function badgesOf(s: PlayStats): Badge[] {
  return [
    { key: 'first_shift', icon: '🐣', name: '첫 근무', goal: '근무 1번 마치기', have: s.shifts, need: 1 },
    { key: 'shift10', icon: '💪', name: '근무 10번', goal: '근무 10번 마치기', have: s.shifts, need: 10 },
    { key: 'ontime5', icon: '⏰', name: '칼출근', goal: '정시 출근 5번', have: s.onTime, need: 5 },
    { key: 'selfout10', icon: '✅', name: '마무리 장인', goal: '종료 직접 누르기 10번', have: s.selfOut, need: 10 },
    { key: 'two_co', icon: '🧭', name: '여기저기', goal: '두 회사에서 일하기', have: s.companies, need: 2 },
    { key: 'sign5', icon: '✍️', name: '서명 달인', goal: '서류 서명 5건', have: s.signed, need: 5 },
    { key: 'review1', icon: '⭐', name: '첫 후기', goal: '회사 후기 1개 남기기', have: s.reviews, need: 1 },
    { key: 'post1', icon: '📝', name: '첫 글', goal: '커뮤니티에 글 1개 쓰기', have: s.posts, need: 1 },
    { key: 'talk10', icon: '💬', name: '수다쟁이', goal: '댓글 10개 달기', have: s.comments, need: 10 },
    { key: 'liked10', icon: '❤️', name: '인기쟁이', goal: '내 글에 좋아요 10개', have: s.likesGot, need: 10 },
    { key: 'pal1', icon: '🤝', name: '첫 동료', goal: '동료 1명 맺기', have: s.coworkers, need: 1 },
    { key: 'profile', icon: '🪪', name: '준비 완료', goal: '내 정보 다 채우기', have: s.profileDone ? 1 : 0, need: 1 },
  ]
}

export type Challenge = { key: string; label: string; have: number; need: number; href: string }

/** 이번 주 챌린지 (월요일마다 새로) — 기록으로 판단하는 것만 (퀴즈는 화면에서 따로) */
export function challengesOf(s: PlayStats): Challenge[] {
  return [
    { key: 'w_shift', label: '근무 2번 마치기', have: s.week.shifts, need: 2, href: '/' },
    { key: 'w_ontime', label: '정시 출근 1번', have: s.week.onTime, need: 1, href: '/me' },
    { key: 'w_talk', label: '커뮤니티에 글·댓글 1개', have: s.week.talk, need: 1, href: '/community' },
  ]
}

export type QuizItem = { q: string; choices: string[]; answer: number; why: string }

/**
 * 알바 상식 퀴즈 (근로기준법 등 기본 · 2026년 기준).
 * 숫자는 앱의 계산 규칙과 같게 (최저시급 10,320원 · 주휴 15시간 · 일용근로 하루 15만원 공제 · 사업소득 3.3%)
 */
export const QUIZ: QuizItem[] = [
  { q: '2026년 최저시급은 얼마일까요?', choices: ['9,860원', '10,030원', '10,320원', '11,000원'], answer: 2, why: '2026년 최저시급은 10,320원이에요. (2025년 10,030원 · 2024년 9,860원)' },
  { q: '주휴수당을 받으려면 한 주에 몇 시간 이상 일하기로 해야 할까요?', choices: ['8시간', '15시간', '20시간', '40시간'], answer: 1, why: '한 주 15시간 이상 일하기로 하고, 그 주에 빠지지 않고 나오면 받아요.' },
  { q: '8시간 일하는 날, 쉬는 시간은 적어도 얼마일까요?', choices: ['30분', '1시간', '1시간 30분', '없어도 돼요'], answer: 1, why: '4시간이면 30분, 8시간이면 1시간 이상 쉬어야 해요.' },
  { q: '4시간 일하는 날, 쉬는 시간은 적어도 얼마일까요?', choices: ['없어도 돼요', '15분', '30분', '1시간'], answer: 2, why: '일하는 시간 4시간마다 30분 이상 쉬는 시간이 있어야 해요.' },
  { q: '밤 근무로 50%를 더 받는 시간은 언제일까요?', choices: ['저녁 8시~새벽 4시', '밤 10시~아침 6시', '밤 12시~아침 8시', '밤 9시~아침 5시'], answer: 1, why: '밤 10시부터 아침 6시까지예요. (상시 5명 이상 일하는 곳)' },
  { q: '근로계약서는 언제 받아야 할까요?', choices: ['첫 월급 받을 때', '일을 시작할 때', '한 달 뒤에', '안 받아도 돼요'], answer: 1, why: '회사는 일을 시작할 때 근로계약서를 써서 근무자에게 줘야 해요.' },
  { q: '하루 일당(일용근로)은 얼마까지 소득세가 없을까요?', choices: ['10만원', '15만원', '20만원', '30만원'], answer: 1, why: '하루 15만원을 뺀 나머지에만 소득세가 붙어요.' },
  { q: '프리랜서(사업소득)로 받을 때 보통 떼는 세금은?', choices: ['1.1%', '3.3%', '8.8%', '10%'], answer: 1, why: '소득세 3% + 지방소득세 0.3% = 3.3%예요.' },
  { q: '임금명세서는 어떻게 받을까요?', choices: ['회사가 꼭 줘야 해요', '달라고 할 때만', '정규직만 받아요', '없어도 돼요'], answer: 0, why: '급여를 줄 때 회사는 임금명세서도 꼭 함께 줘야 해요.' },
  { q: '퇴직금을 받을 수 있는 조건은?', choices: ['3개월 이상 근무', '6개월 이상 근무', '1년 이상 + 주 15시간 이상', '2년 이상 근무'], answer: 2, why: '1년 이상 일하고, 평균 한 주 15시간 이상이면 받아요.' },
  { q: '만 18세 미만이 알바할 때 회사에 내는 서류는?', choices: ['주민등록등본만', '가족관계증명서 + 부모님 동의서', '통장 사본만', '아무것도 없어요'], answer: 1, why: '가족관계증명서와 부모님(친권자) 동의서를 내야 해요.' },
  { q: '주휴수당 계산은 어떻게 할까요? (한 주 40시간 미만)', choices: ['시급 × 8', '(한 주 시간 ÷ 40) × 8 × 시급', '시급 × 일한 날', '시급 × 4'], answer: 1, why: '(한 주에 일하기로 한 시간 ÷ 40) × 8시간 × 시급이에요.' },
  { q: '하루 8시간을 넘겨 일하면 얼마를 더 받을까요? (5명 이상 일하는 곳)', choices: ['10%', '30%', '50%', '100%'], answer: 2, why: '연장근로는 50%를 더 받아요.' },
  { q: '일당 알바(일용근로)도 고용보험에 들어갈까요?', choices: ['안 들어가요', '들어가요', '정규직만 들어가요', '3개월 뒤부터'], answer: 1, why: '일용근로자도 고용보험 대상이라 회사가 근무 내용을 신고해요.' },
  { q: '최저시급보다 적게 주기로 한 계약은?', choices: ['그대로 지켜야 해요', '최저시급만큼은 받을 수 있어요', '회사 마음이에요', '내가 동의하면 괜찮아요'], answer: 1, why: '최저시급보다 적은 부분은 효력이 없어서, 최저시급만큼은 받을 수 있어요.' },
  { q: '해피워크에서 일이 끝나면 꼭 눌러야 하는 것은?', choices: ['근무 종료', '공유하기', '알림 끄기', '로그아웃'], answer: 0, why: '근무 종료를 눌러야 일한 시간과 급여가 계산돼요.' },
]

/** 오늘의 운세 (재미용 · 사람과 날짜로 정해져서 하루 동안 같은 결과) */
const FORTUNES = [
  '조금 일찍 도착하면 좋은 일이 생겨요',
  '새 동료와 금방 친해지는 날이에요',
  '꼼꼼함이 빛나는 하루예요',
  '웃는 얼굴이 행운을 불러요',
  '물을 자주 마시면 컨디션 최고!',
  '기다리던 연락이 올지도 몰라요',
  '작은 친절이 크게 돌아오는 날',
  '새로운 공고에 도전해 보세요',
  '오늘은 푹 쉬어 가도 괜찮아요',
  '칭찬을 듣게 될 예감이에요',
  '준비물을 한 번 더 챙기면 완벽해요',
  '퇴근길 하늘을 한번 올려다보세요',
]
const ITEMS = ['보조배터리', '편한 운동화', '물병', '손수건', '선크림', '핫팩', '볼펜', '사탕', '우산', '이어폰']

/** 문자열 → 0 이상의 정수 (같은 입력이면 늘 같은 값) */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type Fortune = { text: string; item: string; hour: number; stars: number }

export function fortuneOf(seed: string, date: string): Fortune {
  const h = hash(`${seed}:${date}`)
  return {
    text: FORTUNES[h % FORTUNES.length],
    item: ITEMS[Math.floor(h / 13) % ITEMS.length],
    hour: 9 + (Math.floor(h / 131) % 11),
    stars: 3 + (Math.floor(h / 1709) % 3),
  }
}

/** 퀴즈 5문제 고르기 (같은 날·같은 사람이면 섞는 순서가 매번 달라도 됨 — 화면에서 고름) */
export function pickQuiz(rand: () => number, n = 5): QuizItem[] {
  const pool = [...QUIZ]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, n)
}
