'use client'

import { usePathname } from 'next/navigation'
import Skeleton, { AdminDocsSkeleton, DocSkeleton } from '@/components/Skeleton'

/** 서류 메뉴를 불러오는 동안: 목록이면 목록 모양(탭·거르기·공고별 묶음), 서류 한 장이면 종이 모양 */
export default function Loading() {
  const path = usePathname()
  if (path === '/admin/docs') return <AdminDocsSkeleton />
  return /^\/admin\/docs\/[0-9a-f-]{36}$/.test(path) ? <DocSkeleton /> : <Skeleton cards={3} />
}
