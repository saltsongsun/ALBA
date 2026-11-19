import { VendorsSkeleton } from '@/components/Skeleton'

/**
 * 외주 관리를 여는 동안: 실제 화면 모양 (제목 · 지급할 금액 칸 · 탭 세 개 · 견적 카드)
 * 목록 화면에만 둠 ((list) 묶음) — 업체·견적 상세(/admin/vendors/[id] 등)는 모양이 달라서 지금처럼 기본 관리자 모양으로
 */
export default function Loading() {
  return <VendorsSkeleton />
}
