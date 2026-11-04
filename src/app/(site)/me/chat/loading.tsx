'use client'

import { useSearchParams } from 'next/navigation'
import { ChatSkeleton, InboxSkeleton } from '@/components/Skeleton'

/** 문의를 불러오는 동안: 목록(아래 탭 '문의')이면 대화방 줄 모양, 회사와의 대화(?co=)면 말풍선 모양 */
export default function Loading() {
  return useSearchParams().has('co') ? <ChatSkeleton /> : <InboxSkeleton />
}
