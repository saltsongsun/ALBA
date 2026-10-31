import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { joinNow } from '@/app/actions/worker'
import { wageBadge } from '@/components/JobCard'
import { SubmitButton } from '@/components/ui'
import { getJob } from '@/lib/data'
import { db } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { joinOk } from '@/lib/emergency'
import { getUser } from '@/lib/session'
import { fmtDate, kstDate } from '@/lib/time'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '긴급 투입' }

/** 현장 QR로 들어온 긴급 투입 인력: 가입·로그인 → 바로 합류(확정) */
export default async function JoinPage(props: PageProps<'/join/[id]'>) {
  const { id } = await props.params
  const sp = await props.searchParams
  if (!isUuid(id)) notFound()
  const code = typeof sp.c === 'string' ? sp.c.slice(0, 40) : ''
  const [job, user] = await Promise.all([getJob(id), getUser()])
  if (!job || job.status === 'draft') notFound()
  const ok = joinOk(job, code)
  const here = `/join/${job.id}?c=${encodeURIComponent(code)}`
  const app = user
    ? ((await db().from('applications').select('status').eq('job_id', job.id).eq('user_id', user.id).maybeSingle()).data as { status: string } | null)
    : null

  return (
    <div className="space-y-4">
      <div className="card space-y-2 text-center">
        <p className="text-sm font-bold text-rose-600">🚨 현장 긴급 투입</p>
        <h1 className="text-xl font-extrabold">{job.title}</h1>
        <p className="text-sm text-sub">
          {fmtDate(kstDate())} {scheduleText(job)}
          {job.location_name && ` · ${job.location_name}`}
        </p>
        <p className="font-bold">{wageBadge(job)}</p>
      </div>
      {!ok ? (
        <div className="card py-8 text-center">
          <p className="font-bold">QR이 만료됐어요</p>
          <p className="mt-1 text-sm text-sub">긴급 투입 QR은 행사 당일에만 쓸 수 있어요. 현장 담당자에게 새 QR을 보여 달라고 해 주세요.</p>
        </div>
      ) : !user ? (
        <div className="card space-y-3 text-center">
          <p className="font-semibold">처음이면 1분 가입, 가입했으면 로그인하면 바로 합류돼요</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/signup?next=${encodeURIComponent(here)}`} className="btn-primary">
              1분 가입
            </Link>
            <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn-gray">
              로그인
            </Link>
          </div>
        </div>
      ) : app?.status === 'approved' ? (
        <div className="card space-y-3 text-center">
          <p className="font-bold">이미 근무가 확정됐어요</p>
          <Link href="/me" className="btn-primary w-full">
            내 근무에서 출근하기
          </Link>
        </div>
      ) : (
        <form action={joinNow.bind(null, job.id, code)} className="card space-y-3 text-center">
          <p className="font-semibold">{user.name}님, 지금 바로 합류할까요?</p>
          <p className="text-sm text-sub">합류하면 근무가 확정돼요. 근로계약서 등 서류에 서명한 뒤 출근 버튼을 눌러 주세요.</p>
          <SubmitButton className="btn-primary w-full py-3.5 text-base" pendingText="합류 중…">
            바로 합류하기
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
