'use client'

import { usePathname } from 'next/navigation'
import Skeleton, { RosterSkeleton, WorkerDetailSkeleton } from '@/components/Skeleton'

/** 근무자 명단을 불러오는 동안: 목록이면 사람 카드 모양, 한 사람 화면이면 그 사람 화면 모양(사진·이름·정보 줄·접힌 칸) */
export default function Loading() {
  const path = usePathname()
  if (path === '/admin/workers') return <RosterSkeleton />
  return /^\/admin\/workers\/[0-9a-f-]{36}$/.test(path) ? <WorkerDetailSkeleton /> : <Skeleton cards={3} back />
}
