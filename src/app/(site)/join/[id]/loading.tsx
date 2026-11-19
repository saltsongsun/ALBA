import { JoinSkeleton } from '@/components/Skeleton'

/** 현장 QR → 긴급 투입 화면을 여는 동안 같은 모양 (현장은 데이터가 느린 곳이 많아 빈 화면이 오래 보이지 않게) */
export default function Loading() {
  return <JoinSkeleton />
}
