import type { Metadata } from 'next'
import Link from 'next/link'
import { PostForm } from '@/components/community'
import { canPost, isCategory } from '@/lib/community'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: '글쓰기' }

export default async function NewPostPage(props: PageProps<'/community/new'>) {
  const sp = await props.searchParams
  const user = await requireUser('/community/new')
  const c = typeof sp.c === 'string' && isCategory(sp.c) ? sp.c : 'free'
  const { data } = await db().from('users').select('nickname').eq('id', user.id).maybeSingle()
  const nick = (data as { nickname: string | null } | null)?.nickname
  return (
    <div className="space-y-4">
      <Link href="/community" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 커뮤니티
      </Link>
      <h1 className="text-2xl font-extrabold">글쓰기</h1>
      {canPost(user) ? (
        <>
          <p className="rounded-2xl bg-bg px-4 py-3 text-sm text-sub" data-nick-note>
            {nick ? (
              <>
                <b className="text-ink">{nick}</b> 별명으로 올라가요.{' '}
              </>
            ) : (
              '처음 글을 쓰면 별명이 자동으로 정해져요. '
            )}
            <Link href="/me/profile#nickname" className="font-semibold whitespace-nowrap text-brand-600">
              별명 바꾸기
            </Link>
          </p>
          <div className="card">
            <PostForm defaultCategory={c} />
          </div>
        </>
      ) : (
        <p className="card text-sm text-sub">외주 업체 계정은 커뮤니티를 읽기만 할 수 있어요.</p>
      )}
    </div>
  )
}
