import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PostForm } from '@/components/community'
import { canWrite, getPost } from '@/lib/community'
import { requireUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '글 고치기' }

/** 내 글 고치기 (가려진 글·남의 글은 안 됨) */
export default async function EditPostPage(props: PageProps<'/community/[id]/edit'>) {
  const { id } = await props.params
  const user = await requireUser(`/community/${id}/edit`)
  if (!isUuid(id)) notFound()
  const got = await getPost(id, { id: user.id, isSuper: false })
  if (!got || got.post.author_id !== user.id || got.post.hidden_at || !canWrite(user)) notFound()
  const { post } = got
  return (
    <div className="space-y-4">
      <Link href={`/community/${post.id}`} className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 글로 돌아가기
      </Link>
      <h1 className="text-2xl font-extrabold">글 고치기</h1>
      <div className="card" data-edit-form>
        <PostForm defaultCategory={post.category} post={{ id: post.id, title: post.title, body: post.body }} />
      </div>
    </div>
  )
}
