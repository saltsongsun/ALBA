import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReviewForm } from '@/components/community'
import { canWrite, workedJob } from '@/lib/community'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '후기 남기기' }

/** 일한 공고의 회사·행사 후기 (공고마다 하나, 고칠 수 있음) */
export default async function ReviewPage(props: PageProps<'/me/review/[jobId]'>) {
  const { jobId } = await props.params
  const user = await requireUser(`/me/review/${jobId}`)
  if (!isUuid(jobId)) notFound()
  const [{ data: job }, worked, { data: mine }] = await Promise.all([
    db().from('jobs').select('id, title, company_id, company:companies(company_name)').eq('id', jobId).maybeSingle(),
    workedJob(user.id, jobId),
    db().from('company_reviews').select('rating, body, author_id, job_id').eq('job_id', jobId).eq('author_id', user.id).maybeSingle(),
  ])
  const j = job as { id: string; title: string; company_id: string; company?: { company_name: string } | null } | null
  if (!j) notFound()
  const had = mine as { rating: number; body: string } | null
  return (
    <div className="space-y-4">
      <Link href="/me/history" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 지난 근무
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold">{had ? '내 후기 고치기' : '후기 남기기'}</h1>
        <p className="mt-1 text-sm text-sub">
          <b className="text-ink">{j.title}</b>
          {j.company?.company_name && <> · 🏢 {j.company.company_name}</>}
        </p>
      </div>
      {!canWrite(user) ? (
        <p className="card text-sm text-sub">회사 관리자·외주 업체 계정은 후기를 쓸 수 없어요.</p>
      ) : !worked ? (
        <p className="card text-sm text-sub" data-review-blocked>
          이 공고에서 출근 기록이 있는 근무자만 후기를 쓸 수 있어요.
        </p>
      ) : (
        <>
          <p className="rounded-2xl bg-bg px-4 py-3 text-sm text-sub">🙈 후기는 실명 대신 별명으로 보여요. 회사는 누가 썼는지 알 수 없어요.</p>
          <div className="card">
            <ReviewForm jobId={j.id} rating={had?.rating} body={had?.body} />
          </div>
          <Link href={`/community/company/${j.company_id}`} className="block text-center text-sm font-semibold text-brand-600">
            이 회사 후기 모두 보기 →
          </Link>
        </>
      )}
    </div>
  )
}
