import type { Metadata } from 'next'
import Link from 'next/link'
import { PostForm } from '@/components/community'
import { canPost, canWrite, isCategory } from '@/lib/community'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { fmtDate, kstDate } from '@/lib/time'

export const metadata: Metadata = { title: '글쓰기' }

export default async function NewPostPage(props: PageProps<'/community/new'>) {
  const sp = await props.searchParams
  const user = await requireUser('/community/new')
  const c = typeof sp.c === 'string' && isCategory(sp.c) ? sp.c : 'free'
  // 빈 커뮤니티의 '이런 글로 시작해 보세요'에서 왔으면 제목 첫머리를 채워 둠 (글자만 · 40자까지)
  const t = typeof sp.t === 'string' ? sp.t.replace(/[\u0000-\u001f<>]/g, '').slice(0, 40) : undefined
  const { data } = await db().from('users').select('nickname').eq('id', user.id).maybeSingle()
  const nick = (data as { nickname: string | null } | null)?.nickname
  // '같이 가요'에서 고를 내 근무: 확정됐고 아직 끝나지 않은 것 (가까운 날 순 3개 · 내 지원만 — 정기 개선 2026-11-22 00:35)
  const today = kstDate()
  const myWork = canWrite(user)
    ? (((await db().from('applications').select('job_id, user_id, status, available_dates, job:jobs(title, event_name, start_date, end_date, status)').eq('user_id', user.id).eq('status', 'approved').limit(100)).data ?? []) as unknown as {
        job_id: string
        user_id: string
        status: string
        available_dates: string[] | null
        job: { title: string; event_name: string | null; start_date: string; end_date: string; status: string } | null
      }[])
        .filter((a) => a.user_id === user.id && a.status === 'approved' && a.job && a.job.status !== 'cancelled' && a.job.end_date >= today)
        .flatMap((a) => {
          // 고른 날짜가 있으면 그중 오늘 이후 첫날 (모두 지났으면 뺌) · 없으면 시작일(이미 시작했으면 오늘)
          const picked = a.available_dates?.length ? a.available_dates.filter((d) => d >= today).sort()[0] : a.job!.start_date >= today ? a.job!.start_date : today
          if (!picked) return []
          const name = a.job!.event_name || a.job!.title
          return [{ key: a.job_id, day: picked, label: `${fmtDate(picked)} ${name}`, title: `${fmtDate(picked)} ${name} 같이 가요`.slice(0, 40) }]
        })
        .sort((x, y) => x.day.localeCompare(y.day))
        .slice(0, 3)
        .map(({ key, label, title }) => ({ key, label, title }))
    : []
  return (
    <div className="space-y-4">
      <Link href="/community" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
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
            <PostForm defaultCategory={c} defaultTitle={t} myWork={myWork} />
          </div>
        </>
      ) : (
        <p className="card text-sm text-sub">외주 업체 계정은 커뮤니티를 읽기만 할 수 있어요.</p>
      )}
    </div>
  )
}
