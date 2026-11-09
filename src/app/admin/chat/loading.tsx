'use client'

import { usePathname } from 'next/navigation'
import { AdminInboxSkeleton, ChatSkeleton } from '@/components/Skeleton'

/** 문의를 불러오는 동안: 목록이면 목록 모양(단체방·대화 줄), 대화방·단체방이면 말풍선 모양 */
export default function Loading() {
  return usePathname() === '/admin/chat' ? <AdminInboxSkeleton /> : <ChatSkeleton />
}
