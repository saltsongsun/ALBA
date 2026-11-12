import { ChatSkeleton } from '@/components/Skeleton'

/** 관리자 1:1 문의 대화를 여는 동안 (말풍선 모양 · 문의 목록 모양 대신) */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl">
      <ChatSkeleton />
    </div>
  )
}
