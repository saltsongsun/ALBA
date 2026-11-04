import Skeleton from '@/components/Skeleton'

/** 공고 수정 화면 (입력 칸 카드 모양 · 공고 화면 모양이 아니라) */
export default function Loading() {
  return <Skeleton cards={3} back />
}
