import type { Audience, MemberType } from './types'

/** 가입 유형 이름·설명 (가입 화면·배지) */
/** pick: 가입 유형 고르기 카드의 두 줄 (360px에서 한 줄씩 — 누가 고르는지 / 앱으로 하는 일) */
export const MEMBER_TYPES: Record<MemberType, { label: string; short: string; emoji: string; desc: string; pick: [string, string]; badge: string }> = {
  worker: {
    label: '아르바이트',
    short: '알바',
    emoji: '🙋',
    desc: '행사 스태프·안내·진행 보조 등 단기 알바. 출퇴근·근로계약·급여를 앱으로',
    pick: ['행사 스태프·안내·진행 보조', '출퇴근·계약·급여를 앱으로'],
    badge: 'bg-brand-50 text-brand-700',
  },
  expert: {
    label: '전문가',
    short: '전문가',
    emoji: '🎛️',
    desc: '음향·조명·영상·MC·사진 등 기술·전문 인력 (개인). 용역계약 · 사업소득 3.3%',
    pick: ['음향·조명·영상·MC·사진', '용역계약 · 사업소득 3.3%'],
    badge: 'bg-violet-50 text-violet-700',
  },
  vendor: {
    label: '외주 업체',
    short: '업체',
    emoji: '🏢',
    desc: '장비·인력·설치 등을 맡는 사업자. 견적 요청을 받고 대금·세금계산서를 앱에서 확인',
    pick: ['장비·인력·설치 사업자', '견적·대금·세금계산서 확인'],
    badge: 'bg-emerald-50 text-emerald-700',
  },
}

export const isMemberType = (v: unknown): v is MemberType => v === 'worker' || v === 'expert' || v === 'vendor'

/** 전문가·외주 업체 (전문가 화면을 씀) */
export const isPro = (t: MemberType | null | undefined) => t === 'expert' || t === 'vendor'

/** 이 회원이 이 공고에 지원할 수 있는지: 알바 공고는 알바, 전문가 의뢰는 전문가만 (외주 업체는 견적으로) */
export function canApplyTo(member: MemberType, audience: Audience): boolean {
  return audience === 'expert' ? member === 'expert' : member === 'worker'
}

/** 전문 분야 고르기 (가입·내 정보) */
export const SPECIALTIES = ['음향', '조명', '영상·LED', '무대·설치', 'MC·진행', '사진·촬영', '디자인', '통역', '경호·안전', '운송', '기타'] as const

export function parseSpecialty(raw: string): string | null {
  const picked = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => (SPECIALTIES as readonly string[]).includes(s))
  return picked.length ? [...new Set(picked)].join(',') : null
}

/** 사업자등록번호: 숫자 10자리 → 000-00-00000 */
export function bizNoFmt(v: string | null | undefined): string {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : (v ?? '')
}

/** 계약서 이름: 전문가 의뢰는 용역계약서(사업소득), 아르바이트는 근로계약서 */
export const contractNameOf = (audience: string | null | undefined) => (audience === 'expert' ? '용역계약서' : '근로계약서')

/** 근무자 앱의 일정 탭 이름: 전문가 화면은 '내 일', 아르바이트 화면은 '내 근무' (알림에서 탭 이름을 맞게 안내) */
export const myWorkTab = (audience: string | null | undefined) => (audience === 'expert' ? '내 일' : '내 근무')
