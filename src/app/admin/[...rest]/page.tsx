import { notFound } from 'next/navigation'

/**
 * 관리자 화면 아래의 없는 주소 (예전 알림·즐겨찾기의 바뀐 주소, 잘못 친 주소).
 * 이 파일이 없으면 근무자용 '모집 중인 알바 · 내 근무' 화면이 떠서 관리자 메뉴가 사라짐
 * → 관리자 메뉴와 회사 고르기를 그대로 둔 안내(admin/not-found.tsx)가 뜨게 함
 */
export default function AdminUnknown() {
  notFound()
}
