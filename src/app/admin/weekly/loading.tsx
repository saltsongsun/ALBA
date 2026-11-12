import { WeeklySkeleton } from '@/components/Skeleton'

/** 주간 근무·주휴를 불러오는 동안: 실제 화면 모양 (주 넘기기 · 두 칸 · 근무자 시간 막대) */
export default function Loading() {
  return <WeeklySkeleton />
}
