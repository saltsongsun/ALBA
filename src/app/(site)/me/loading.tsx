'use client'

import { usePathname } from 'next/navigation'
import Skeleton, { MeSkeleton } from '@/components/Skeleton'

/** 내 근무를 불러오는 동안: 내 근무 화면 모양(인사 · 오늘의 근무 카드 · 이번 주 칸) · 그 밖의 하위 화면(후기 쓰기 등)은 일반 카드 */
export default function Loading() {
  return usePathname() === '/me' ? <MeSkeleton /> : <Skeleton cards={2} />
}
