import { JobFormSkeleton } from '@/components/Skeleton'

/** 새 공고 쓰기를 여는 동안 (공고 쓰기 모양 · 대시보드 모양 대신) */
export default function Loading() {
  return <JobFormSkeleton />
}
