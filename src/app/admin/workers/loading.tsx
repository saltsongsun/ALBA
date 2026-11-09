'use client'

import { usePathname } from 'next/navigation'
import Skeleton, { RosterSkeleton } from '@/components/Skeleton'

/** 근무자 명단을 불러오는 동안: 목록이면 사람 카드 모양, 한 사람 화면이면 '← 목록'과 카드 모양 */
export default function Loading() {
  return usePathname() === '/admin/workers' ? <RosterSkeleton /> : <Skeleton cards={3} back />
}
