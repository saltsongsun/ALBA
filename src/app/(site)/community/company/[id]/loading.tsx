import Skeleton from '@/components/Skeleton'

/** 불러오는 동안 ('← 돌아가기' · 제목 · 설명 · 카드 모양) */
export default function Loading() {
  return <Skeleton back cards={2} />
}
