import { QuoteSkeleton } from '@/components/Skeleton'

/** 견적 요청을 불러오는 동안: 같은 모양의 뼈대 (업체가 문자 링크를 휴대폰 데이터로 열 때 빈 화면이 길게 보이지 않게) */
export default function Loading() {
  return <QuoteSkeleton />
}
