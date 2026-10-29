import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deleteJob, duplicateJob, setJobStatus } from '@/app/actions/admin'
import Flash from '@/components/Flash'
import { wageBadge } from '@/components/JobCard'
import { ConfirmSubmit, CopyButton, SubmitButton } from '@/components/ui'
import { getJob, getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { recruitText, scheduleText } from '@/lib/docs'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { dateList, fmtDateRange, kstDate } from '@/lib/time'
import type { Application, Attendance, Job, SignedDoc } from '@/lib/types'
import { isDate, isUuid } from '@/lib/validate'
import AppsTab from './AppsTab'
import AttTab from './AttTab'
import DocsTab from './DocsTab'
import PayTab from './PayTab'

export const metadata: Metadata = { title: '공고 관리' }

export type WorkerLite = {
  id: string
  name: string
  phone: string
  birth_date: string | null
  bank_name: string | null
  bank_account_enc: string | null
  account_holder: string | null
}
export type AppRow = Application & { user: WorkerLite }

const STATUS_LABEL: Record<Job['status'], string> = { open: '모집중', closed: '모집마감', draft: '임시저장', done: '종료' }

export default async function AdminJobPage(props: PageProps<'/admin/jobs/[id]'>) {
  await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  if (!isUuid(id)) notFound()

  // 공고와 지원·출퇴근·서류를 한 번에 읽음
  const userCols = 'id, name, phone, birth_date, bank_name, bank_account_enc, account_holder'
  const [job, settings, origin, apps, atts, docs, allTemplates] = await Promise.all([
    getJob(id),
    getSettings(),
    siteOrigin(),
    db()
      .from('applications')
      .select(`*, user:users(${userCols})`)
      .eq('job_id', id)
      .order('created_at')
      .then((r) => must(r) as AppRow[]),
    db()
      .from('attendance')
      .select('*')
      .eq('job_id', id)
      .order('work_date')
      .then((r) => must(r) as Attendance[]),
    db()
      .from('signed_docs')
      .select('id, user_id, template_id, title, status, signed_at, created_at')
      .eq('job_id', id)
      .order('created_at')
      .then((r) => must(r) as Pick<SignedDoc, 'id' | 'user_id' | 'template_id' | 'title' | 'status' | 'signed_at' | 'created_at'>[]),
    db().from('doc_templates').select('id, title').then((r) => must(r) as { id: string; title: string }[]),
  ])
  if (!job) notFound()
  const templates = allTemplates.filter((t) => job.required_docs.includes(t.id))

  // 출퇴근 기록은 있는데 지원 내역이 없는 사람(관리자 직접 등록 등)도 정산에 포함
  const known = new Set(apps.map((a) => a.user_id))
  const extraIds = [...new Set(atts.map((a) => a.user_id))].filter((u) => !known.has(u))
  const extraUsers = extraIds.length
    ? (must(await db().from('users').select(userCols).in('id', extraIds)) as WorkerLite[])
    : []
  const users = new Map<string, WorkerLite>([...apps.map((a) => [a.user_id, a.user] as const), ...extraUsers.map((u) => [u.id, u] as const)])

  const today = kstDate()
  const dates = dateList(job.start_date, job.end_date)
  const date = typeof sp.date === 'string' && isDate(sp.date) && dates.includes(sp.date)
    ? sp.date
    : dates.includes(today) ? today : dates[0]
  const tab = (['apps', 'att', 'pay', 'docs'] as const).find((t) => t === sp.tab) ?? (dates.includes(today) ? 'att' : 'apps')
  const approved = apps.filter((a) => a.status === 'approved')
  const waiting = apps.filter((a) => a.status === 'applied')
  const pendingDocs = docs.filter((d) => d.status === 'pending').length
  const link = `${origin}/jobs/${job.id}`
  const text = recruitText(job, link, settings.company_name)

  const TABS = [
    ['apps', `지원자 ${apps.filter((a) => a.status !== 'cancelled').length}`],
    ['att', '출퇴근'],
    ['pay', '정산'],
    ['docs', `서류${pendingDocs ? ` (대기 ${pendingDocs})` : ''}`],
  ] as const

  return (
    <div className="space-y-5">
      <Flash m={sp.m} />
      <Link href="/admin/jobs" className="text-sm font-semibold text-sub">
        ← 공고 목록
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="card">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge bg-ink text-white">{STATUS_LABEL[job.status]}</span>
            {job.event_name && <span className="text-sm font-semibold text-mute">{job.event_name}</span>}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold">{job.title}</h1>
          <p className="mt-1 text-sub">
            {fmtDateRange(job.start_date, job.end_date)} {scheduleText(job)} · {job.location_name}
          </p>
          <p className="mt-1 text-sm">
            {wageBadge(job)} · 확정 <b>{approved.length}</b>/{job.headcount}명 · 대기 {waiting.length}명
            {job.gps_required && <span className="badge ml-2 bg-emerald-50 text-emerald-700">현장 위치 확인</span>}
            {job.auto_approve && <span className="badge ml-1 bg-brand-50 text-brand-700">자동 확정</span>}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/admin/jobs/${job.id}/edit`} className="btn-soft btn-sm">
              수정
            </Link>
            <form action={duplicateJob.bind(null, job.id)}>
              <SubmitButton className="btn-gray btn-sm">복사해서 새 공고</SubmitButton>
            </form>
            {job.status !== 'open' && (
              <form action={setJobStatus.bind(null, job.id, 'open')}>
                <SubmitButton className="btn-gray btn-sm">모집 열기</SubmitButton>
              </form>
            )}
            {job.status === 'open' && (
              <form action={setJobStatus.bind(null, job.id, 'closed')}>
                <SubmitButton className="btn-gray btn-sm">모집 마감</SubmitButton>
              </form>
            )}
            {job.status !== 'done' && (
              <form action={setJobStatus.bind(null, job.id, 'done')}>
                <SubmitButton className="btn-gray btn-sm">행사 종료</SubmitButton>
              </form>
            )}
            <form action={deleteJob.bind(null, job.id)}>
              <ConfirmSubmit className="btn-danger btn-sm" confirmText="정말 삭제?">
                삭제
              </ConfirmSubmit>
            </form>
          </div>
        </div>

        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">단톡방 모집 문구</h2>
            <div className="flex gap-1">
              <CopyButton text={link} label="링크만" />
              <CopyButton text={text} label="문구 복사" className="btn-primary btn-sm" />
            </div>
          </div>
          <textarea readOnly value={text} rows={9} className="input resize-none bg-bg text-[13px] leading-relaxed" />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line text-sm font-semibold">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/jobs/${job.id}?tab=${k}${k === 'att' ? `&date=${date}` : ''}`}
            className={`shrink-0 border-b-2 px-4 py-2.5 ${tab === k ? 'border-ink text-ink' : 'border-transparent text-mute'}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === 'apps' && <AppsTab job={job} apps={apps} />}
      {tab === 'att' && <AttTab job={job} apps={approved} atts={atts} users={users} date={date} dates={dates} />}
      {tab === 'pay' && <PayTab job={job} atts={atts} users={users} />}
      {tab === 'docs' && <DocsTab job={job} approved={approved} docs={docs} templates={templates} users={users} origin={origin} />}
    </div>
  )
}
