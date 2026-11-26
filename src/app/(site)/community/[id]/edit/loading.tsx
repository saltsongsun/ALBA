import { PostWriteSkeleton } from '@/components/Skeleton'

/** ✏️ 정기 개선 2026-11-27 03:36 (새 파일): 글 고치기를 불러오는 동안 (글 보기 모양 대신 쓰기 칸 모양 · 별명 안내 줄은 없음) */
export default function Loading() {
  return <PostWriteSkeleton note={false} />
}
