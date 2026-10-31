import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cancelEvent, deleteJob, duplicateJob, setJobStatus } from '@/app/actions/admin'
import Announce from '@/components/Announce'
import Flash from '@/components/Flash'
import { wageBadge } from '@/components/JobCard'
import { ConfirmSubmit, CopyButton, SubmitButton } from '@/components/ui'
import { getJob, getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { recruitText, scheduleText } from '@/lib/docs'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { dateList, fmtDate, fmtDateRange, kstDate } from '@/lib/time'
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
  photo_at: string | null
}
export type AppRow = Application & { user: WorkerLite }

const STATUS_LABEL: Record<Job['status'], string> = { open: '모집중', closed: '모집마감', draft: '임시저장', done: '종료', cancelled: '행사 취소' }

export default async function AdminJobPage(props: PageProps<'/admin/jobs/[id]'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  if (!isUuid(id)) notFound()

  // 공고와 지원·출퇴근·서류를 한 번에 읽음
  const userCols = 'id, name, phone, birth_date, bank_name, bank_account_enc, account_holder, photo_at'
  const [job, settings, origin, apps, atts, docs, allTemplates, myRatings] = await Promise.all([
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
    db().from('doc_templates').select('id, title, kind').then((r) => must(r) as { id: string; title: string; kind: string }[]),
    // 내가 이 공고 근무자들에게 매긴 별점 (출퇴근 화면의 빠른 평가)
    db()
      .from('worker_ratings')
      .select('user_id, score')
      .eq('job_id', id)
      .eq('rater_id', admin.id)
      .then((r) => must(r) as { user_id: string; score: number }[]),
  ])
  if (!job) notFound()
  // 근로계약서를 종이·다른 서비스로 받으면 앱 서명 서류에서 계약서 서식은 뺌
  const templates = allTemplates.filter((t) => job.required_docs.includes(t.id) && (job.contract_method === 'app' || t.kind !== 'contract'))
  const today = kstDate()
  // 근로계약서를 받지 않는 공고는 위에 경고 (지난 공고·종료한 공고는 제외)
  const noContract = job.contract_method === 'app' && !['done', 'cancelled'].includes(job.status) && job.end_date >= today && !templates.some((t) => t.kind === 'contract')

  // 출퇴근 기록은 있는데 지원 내역이 없는 사람(관리자 직접 등록 등)도 정산에 포함
  const known = new Set(apps.map((a) => a.user_id))
  const extraIds = [...new Set(atts.map((a) => a.user_id))].filter((u) => !known.has(u))
  const extraUsers = extraIds.length
    ? (must(await db().from('users').select(userCols).in('id', extraIds)) as WorkerLite[])
    : []
  const users = new Map<string, WorkerLite>([...apps.map((a) => [a.user_id, a.user] as const), ...extraUsers.map((u) => [u.id, u] as const)])

  const dates = dateList(job.start_date, job.end_date)
  const date = typeof sp.date === 'string' && isDate(sp.date) && dates.includes(sp.date)
    ? sp.date
    : dates.includes(today) ? today : dates[0]
  const tab = (['apps', 'att', 'pay', 'docs'] as const).find((t) => t === sp.tab) ?? (dates.includes(today) ? 'att' : 'apps')
  const approved = apps.filter((a) => a.status === 'approved')
  const waiting = apps.filter((a) => a.status === 'applied')
  const pendingDocs = docs.filter((d) => d.status === 'pending').length
  // 아직 근무 기록이 없고 끝나지 않은 행사만 '행사 취소' 가능
  const canCancel = !['done', 'cancelled', 'draft'].includes(job.status) && job.end_date >= today && atts.length === 0
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
            <span className={`badge ${job.status === 'cancelled' ? 'bg-rose-600 text-white' : 'bg-ink text-white'}`}>{STATUS_LABEL[job.status]}</span>
            {job.event_name && <span className="text-sm font-semibold text-mute">{job.event_name}</span>}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold">{job.title}</h1>
          <p className="mt-1 text-sub">
            {fmtDateRange(job.start_date, job.end_date)} {scheduleText(job)}
            {job.location_name && ` · ${job.location_name}`}
          </p>
          <p className="mt-1 text-sm">
            {wageBadge(job)} · 확정 <b>{approved.length}</b>/{job.headcount}명 · 대기 {waiting.length}명
            {job.gps_required && <span className="badge ml-2 bg-emerald-50 text-emerald-700">현장 위치 확인</span>}
            {job.auto_approve && <span className="badge ml-1 bg-brand-50 text-brand-700">자동 확정</span>}
          </p>
          {job.contract_method !== 'app' && approved.length > 0 && (
            <Link href={`/admin/jobs/${job.id}?tab=docs`} className="mt-1.5 inline-block text-sm">
              📝 근로계약서 {job.contract_method === 'paper' ? '종이' : '모두싸인 등'} · 받음{' '}
              <b className={approved.some((a) => !a.contract_received_at) ? 'text-rose-600' : 'text-emerald-600'}>
                {approved.filter((a) => a.contract_received_at).length}/{approved.length}
              </b>
            </Link>
          )}
          {noContract && (
            <div className="mt-4 animate-pop rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-4">
              <p className="font-bold">✍️ 근로계약서를 받지 않는 공고예요</p>
              <p className="mt-1 text-sm text-sub">
                근로계약서는 근로기준법 제17조에 따라 서면(전자문서)으로 꼭 줘야 해요. 지정하면
                {approved.length > 0 ? ` 이미 확정된 ${approved.length}명에게도 바로 ` : ' 확정되는 사람에게 '}
                서명 요청이 가고, 서명 전에는 근무 시작 버튼이 잠겨요.
              </p>
              <Link href={`/admin/jobs/${job.id}/edit#docs`} className="btn-primary btn-sm mt-3">
                근로계약서 지정하기
              </Link>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/admin/jobs/${job.id}/edit`} className="btn-soft btn-sm">
              수정
            </Link>
            {!['done', 'cancelled', 'draft'].includes(job.status) && job.end_date >= today && (
              <Link href={`/admin/jobs/${job.id}?tab=att&date=${date}&shift=1#shift`} className="btn-soft btn-sm">
                🕒 근무시간 변경
              </Link>
            )}
            <form action={duplicateJob.bind(null, job.id)}>
              <SubmitButton className="btn-gray btn-sm">복사해서 새 공고</SubmitButton>
            </form>
            {job.status !== 'open' && job.status !== 'cancelled' && (
              <form action={setJobStatus.bind(null, job.id, 'open')}>
                <SubmitButton className="btn-gray btn-sm">모집 열기</SubmitButton>
              </form>
            )}
            {job.status === 'open' && (
              <form action={setJobStatus.bind(null, job.id, 'closed')}>
                <SubmitButton className="btn-gray btn-sm">모집 마감</SubmitButton>
              </form>
            )}
            {job.status !== 'done' && job.status !== 'cancelled' && (
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
          {job.status === 'cancelled' && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
              취소한 행사예요. 지원·확정은 모두 취소됐고 근무자에게 알렸어요. 다시 모집하려면 ‘복사해서 새 공고’를 눌러 주세요.
            </p>
          )}
          {/* 비·주최측 사정 등으로 행사가 열리지 않을 때: 사유와 함께 확정·지원자 모두에게 알림 */}
          {canCancel && (
            <details className="mt-3 rounded-xl border border-line px-3.5 py-2.5">
              <summary className="cursor-pointer text-sm font-semibold text-rose-600">행사가 취소됐나요? (우천·주최측 사정 등)</summary>
              <form action={cancelEvent.bind(null, job.id)} className="mt-2.5 space-y-2.5">
                <textarea
                  name="reason"
                  required
                  maxLength={200}
                  rows={2}
                  className="input text-sm"
                  placeholder="취소 사유 (근무자에게 그대로 전달돼요) 예: 태풍 예보로 주최측이 행사를 취소했습니다."
                />
                <p className="hint">
                  확정 {approved.length}명 · 대기 {waiting.length}명에게 앱 문의함과 휴대폰 알림으로 알리고, 지원은 모두 취소돼요. 되돌릴 수 없어요.
                </p>
                <ConfirmSubmit className="btn-danger btn-sm" confirmText="정말 취소하고 알릴까요?">
                  행사 취소하고 알리기
                </ConfirmSubmit>
              </form>
            </details>
          )}
        </div>

        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">단톡방 모집 문구</h2>
            <div className="flex gap-1">
              <CopyButton text={link} label="링크만" />
              <CopyButton text={text} label="문구 복사" className="btn-primary btn-sm" />
            </div>
          </div>
          {/* 문구는 복사 버튼으로 바로 쓰고, 내용은 필요할 때만 펼쳐 봄 */}
          <details className="text-sm">
            <summary className="cursor-pointer py-1 font-semibold text-sub">문구 미리보기</summary>
            <textarea readOnly value={text} rows={9} className="input mt-2 resize-none bg-bg text-[13px] leading-relaxed" />
          </details>
        </div>
      </div>

      {approved.length > 0 && !['done', 'cancelled'].includes(job.status) && (
        <Announce
          jobId={job.id}
          jobTitle={job.title}
          recipients={approved.map((a) => ({ phone: a.user.phone, dates: a.available_dates, position: a.position }))}
          dates={dates.map((d) => ({ value: d, label: fmtDate(d) }))}
        />
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-line text-sm font-semibold">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/jobs/${job.id}?tab=${k}${k === 'att' ? `&date=${date}` : ''}`}
            className={`shrink-0 border-b-2 px-4 py-2.5 transition-colors duration-200 ${tab === k ? 'border-ink text-ink' : 'border-transparent text-mute hover:text-sub'}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === 'apps' && <AppsTab job={job} apps={apps} origin={origin} />}
      {tab === 'att' && <AttTab job={job} apps={approved} atts={atts} users={users} date={date} dates={dates} myScores={Object.fromEntries(myRatings.map((r) => [r.user_id, r.score]))} pos={typeof sp.pos === 'string' ? sp.pos : null} openShift={sp.shift === '1'} />}
      {tab === 'pay' && <PayTab job={job} atts={atts} users={users} origin={origin} />}
      {tab === 'docs' && <DocsTab job={job} approved={approved} docs={docs} templates={templates} users={users} origin={origin} />}
    </div>
  )
}
