import { JobFormSkeleton } from '@/components/Skeleton'

/** 공고 고치기를 여는 동안 (쓰기 화면과 같은 모양: 모집 대상 · 펼친 기본 정보 · 접힌 칸들 · 저장 버튼) */
export default function Loading() {
  return <JobFormSkeleton />
}
