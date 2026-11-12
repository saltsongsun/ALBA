import { ReportsSkeleton } from '@/components/Skeleton'

/** 정산·신고자료를 불러오는 동안: 실제 화면 모양 (달 넘기기 · 지급총액 · 신고자료 목록) */
export default function Loading() {
  return <ReportsSkeleton />
}
