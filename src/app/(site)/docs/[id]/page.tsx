import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import DocSheet from '@/components/DocSheet'
import Flash from '@/components/Flash'
import { PrintButton } from '@/components/ui'
import { JumpToSign, ReadProgress, SignForm } from '@/components/worker'
import { getJob, getSettings } from '@/lib/data'
import { db } from '@/lib/db'
import { buildDocVars, renderTemplate, type DocPerson } from '@/lib/docs'
import { phoneFmt } from '@/lib/format'
import { fmtDate, kstDate, kstDateTime } from '@/lib/time'
import { parseChanges, signalOf } from '@/lib/signals'
import { canManageCompany, requireUser } from '@/lib/session'
import type { CompanySnapshot, DocTemplate, SignedDoc } from '@/lib/types'
import { isUuid } from '@/lib/validate'
import DocGuard from '@/components/DocGuard'
import { viewerMark } from '@/lib/watermark'
import { canOpenJobDocs, docInquiryHref } from '@/lib/doc-access'
import { Fragment } from 'react'
import Icon from '@/components/Icon'

export const metadata: Metadata = { title: '서류' }

export default async function DocPage(props: PageProps<'/docs/[id]'>) {
  const { id } = await props.params
  const sp = await props.searchParams
  // 로그인 확인과 서류 조회를 함께 하고, 본인·관리자 여부는 아래에서 확인
  const [user, doc] = await Promise.all([
    requireUser(`/docs/${id}`),
    isUuid(id)
      ? db()
          .from('signed_docs')
          .select('*, worker:users(name, phone, birth_date, address)')
          .eq('id', id)
          .maybeSingle()
          .then((r) => r.data as (SignedDoc & { worker: DocPerson | null }) | null)
      : null,
  ])
  // 본인 서류이거나, 그 서류 회사의 관리자만 (다른 회사 관리자는 못 봄)
  const admin = !!doc && doc.user_id !== user.id && (await canManageCompany(user, doc.company_id))
  if (!doc || (doc.user_id !== user.id && !admin)) notFound()
  const worker = doc.worker
  if (!worker) notFound()
  // 근무자: 근무가 확정된 동안만 열 수 있음. 지원 취소·확정 되돌림·행사 취소면 (이미 서명했어도) 담당자에게 문의
  if (!admin) {
    let blocked = doc.status === 'void'
    if (!blocked) {
      const { data: app } = await db().from('applications').select('status').eq('job_id', doc.job_id).eq('user_id', doc.user_id).maybeSingle()
      blocked = !canOpenJobDocs((app as { status: string } | null)?.status)
    }
    if (blocked) {
      return (
        <div className="space-y-4">
          <Link href="/me" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
            ← 내 근무
          </Link>
          <div className="card px-6 py-12 text-center">
            <p className="text-3xl" aria-hidden>
              🔒
            </p>
            <p className="mt-2 font-bold">관리자에게 문의해 주세요</p>
            <p className="mt-1 text-sm text-balance text-sub">
              지원을 취소했거나 근무 확정이 취소돼 <span className="whitespace-nowrap">이 서류는 열 수 없어요.</span>
            </p>
            <p className="text-sm text-balance text-sub">서류가 필요하면 담당자에게 요청해 주세요.</p>
            <Link href={docInquiryHref(doc.job_id)} className="btn-primary mt-5">
              💬 담당자에게 문의
            </Link>
          </div>
        </div>
      )
    }
  }

  let body = doc.body ?? ''
  let company: CompanySnapshot | null = doc.company_snapshot
  let seal = doc.seal_image
  // 공고는 서명 전 서식 채우기와 근무자 화면 위 '어느 회사 · 어느 공고 서류인지' 줄에 씀 (관리자가 서명된 서류를 볼 때는 안 읽음)
  const jobP = doc.status !== 'signed' || doc.user_id === user.id ? getJob(doc.job_id) : Promise.resolve(null)
  if (doc.status !== 'signed') {
    const [job, settings, { data: tpl }] = await Promise.all([
      jobP,
      getSettings(doc.company_id, { seal: true }),
      doc.template_id ? db().from('doc_templates').select('*').eq('id', doc.template_id).maybeSingle() : { data: null },
    ])
    if (!job || !tpl) {
      body = '# 서식을 찾을 수 없습니다\n\n담당자에게 문의해 주세요.'
    } else {
      body = renderTemplate((tpl as DocTemplate).body, buildDocVars(job, worker, settings))
    }
    company = settings
    seal = settings.seal_image
  }

  const mine = doc.user_id === user.id
  // 서명한 뒤에 이 공고의 '🔔 일정 변경' 알림을 그 근무자에게 보냈으면: 바뀌기 전 내용으로 서명한 서류 (근무자 · 담당자 모두 — 정기 개선 2026-11-22 06:35)
  const changedAfter =
    doc.status === 'signed' && doc.signed_at
      ? await db()
          .from('messages')
          .select('created_at, body, thread_user_id, job_id')
          .eq('company_id', doc.company_id)
          .eq('job_id', doc.job_id)
          .eq('thread_user_id', doc.user_id)
          .eq('from_admin', true)
          .order('created_at', { ascending: false })
          .limit(100)
          .then((r) =>
            ((r.data ?? []) as { created_at: string; body: string; thread_user_id: string; job_id: string | null }[])
              .filter((m) => m.thread_user_id === doc.user_id && m.job_id === doc.job_id && m.created_at > doc.signed_at! && signalOf(m.body) === 'change')
              .reduce<{ created_at: string; body: string } | null>((a, m) => (!a || m.created_at > a.created_at ? m : a), null),
          )
      : null
  const changedRows = changedAfter ? parseChanges(changedAfter.body).slice(0, 3) : []
  // 근무자 화면: 어느 회사 · 어느 공고 서류인지 한 줄 (여러 회사 서류가 모두 '근로계약서'여도 서명 전에 바로 알게)
  const jobTitle = mine ? ((await jobP)?.title ?? null) : null
  const companyName = company?.company_name || null
  // 서명할 서류가 여러 건이면 몇 번째인지 (같은 공고 먼저, 만든 순서)
  const queue =
    doc.status === 'pending' && mine
      ? (
          (
            await db().from('signed_docs').select('id, job_id, created_at, status').eq('user_id', user.id).eq('status', 'pending')
          ).data as { id: string; job_id: string; created_at: string; status: string }[] | null ?? []
        )
          .filter((d) => d.status === 'pending')
          .sort((a, b) => Number(b.job_id === doc.job_id) - Number(a.job_id === doc.job_id) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      : []
  const pos = queue.findIndex((d) => d.id === doc.id)
  const Guard = admin ? Fragment : DocGuard
  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <div className="no-print flex items-center justify-between">
        <Link href={mine ? '/me' : `/admin/jobs/${doc.job_id}?tab=docs`} className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 돌아가기
        </Link>
        {doc.status === 'signed' ? (
          <span className="flex items-center gap-2">
            {/* 관리자: PDF 파일로 내려받기 (인쇄·보관) */}
            {admin && (
              <a href={`/admin/docs/pdf?id=${doc.id}`} download className="btn-gray" data-doc-pdf data-track="서류 PDF (서류 화면)">
                PDF 받기
              </a>
            )}
            {/* 근무자: 인쇄는 자주 쓰지 않으니 흰 버튼으로 조용히 (담당자 화면은 예전 그대로) — 정기 개선 2026-11-22 06:35 */}
            {mine ? (
              <PrintButton
                className="btn-white btn-sm gap-1"
                label={
                  <>
                    <Icon name="printer" /> PDF 저장
                  </>
                }
              />
            ) : (
              <PrintButton />
            )}
          </span>
        ) : (
          // 몇 번째인지는 바로 아래 진행 막대에 있어 여기서는 '서명 대기'만 (같은 숫자를 두 번 보이지 않게)
          <span className="badge bg-amber-50 text-amber-700">서명 대기</span>
        )}
      </div>
      {mine && (companyName || jobTitle) && (
        <p className="no-print flex min-w-0 items-center gap-1.5 text-sm text-sub" data-doc-for>
          <Icon name="building" className="shrink-0 text-mute" />
          {/* 회사 이름이 길어도 공고 이름이 조금은 보이게 (회사는 60%까지, 넘치면 각각 줄임) */}
          {companyName && <b className="max-w-[60%] shrink-0 truncate font-semibold text-ink">{companyName}</b>}
          {companyName && jobTitle && (
            <span aria-hidden className="shrink-0">
              ·
            </span>
          )}
          {jobTitle && <span className="min-w-0 truncate">{jobTitle}</span>}
        </p>
      )}
      {/* 근무자: 서명한 서류는 맨 위에 언제 서명했는지 한 줄 (맨 아래 작은 글씨까지 내리지 않아도 바로 확인) — 정기 개선 2026-11-21 07:35 */}
      {mine && doc.status === 'signed' && doc.signed_at && (
        <p className="no-print flex items-center gap-1.5 text-sm font-semibold text-emerald-700" data-doc-signed>
          <span aria-hidden className="grid size-5 shrink-0 animate-pop place-items-center rounded-full bg-emerald-100 text-xs">
            ✓
          </span>
          {kstDateTime(doc.signed_at)}에 서명했어요
        </p>
      )}
      {/* 서명한 뒤에 일정이 바뀜: 이 서류는 바뀌기 전 내용 (근무자: 다시 서명 요청이 오면 새 서류에 · 담당자: 공고 서류 탭에서 재서명) */}
      {changedAfter && (
        <div className="no-print animate-slide-down space-y-1.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200" data-doc-changed>
          <p className="font-bold">
            서명한 뒤에 일정이 바뀌었어요 <span className="font-normal text-amber-800">· {fmtDate(kstDate(changedAfter.created_at))}</span>
          </p>
          {changedRows.length > 0 && (
            <ul className="space-y-0.5 text-xs" data-doc-changed-rows>
              {changedRows.map((r, i) => (
                <li key={r.label} className="flex min-w-0 gap-1.5">
                  <span className="shrink-0 font-semibold">{r.label}</span>
                  <span className="min-w-0 truncate">
                    <s className="text-amber-700/70">{r.from}</s> →{' '}
                    {/* 바뀐 값은 차례로 톡 (0.25초 · 움직임 줄이기면 바로) */}
                    <b className="inline-block animate-[pop_0.25s_ease-out_both]" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                      {r.to}
                    </b>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs break-keep">
            {mine ? (
              '이 서류는 바뀌기 전 내용이에요. 담당자가 다시 서명을 부탁하면 새 서류에 서명해 주세요.'
            ) : (
              <>
                이 서류는 바뀌기 전 내용이에요.{' '}
                <Link href={`/admin/jobs/${doc.job_id}?tab=docs#doc-stale`} className="font-semibold whitespace-nowrap underline" data-doc-changed-admin>
                  공고 서류 탭에서 재서명 →
                </Link>
              </>
            )}
          </p>
        </div>
      )}
      {/* 서명할 서류가 여러 건이면 몇 번째인지 */}
      {queue.length > 1 && pos >= 0 && (
        <div className="no-print flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700">
          <span className="font-bold">
            서명할 서류 {pos + 1}/{queue.length}
          </span>
          <span className="flex flex-1 gap-1" aria-hidden>
            {queue.map((d, i) => (
              // 지금 서류 칸은 열 때 왼쪽부터 짧게 차오름 (0.3초 · 동작 줄이기면 바로)
              <span
                key={d.id}
                className={`h-1.5 flex-1 rounded-full ${i < pos ? 'bg-brand-600' : i === pos ? 'origin-left animate-[grow_0.3s_ease-out_0.1s_both] bg-brand-500' : 'bg-white'}`}
                data-doc-step={i < pos ? 'done' : i === pos ? 'now' : 'next'}
              />
            ))}
          </span>
        </div>
      )}
      {doc.status === 'void' && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">무효 처리된 서류예요.</p>}
      {/* 근무자 화면: 복사·저장 막기 + 열람 일시·열람자 워터마크 */}
      <Guard>
      <DocSheet
        watermark={viewerMark(user)}
        docId={doc.id}
        body={body}
        company={company ?? { company_name: '', ceo_name: null, business_no: null, company_address: null, company_phone: null }}
        seal={seal}
        worker={{ name: worker.name, birth_date: worker.birth_date, phone: phoneFmt(worker.phone) }}
        signature={doc.signature}
        signedAt={doc.signed_at}
        signedIp={doc.signed_ip}
        parties={doc.kind === 'service' ? 'service' : 'labor'}
      />
      </Guard>
      {doc.status === 'pending' && mine && (
        <>
          <SignForm docId={doc.id} title={doc.title} userId={user.id} />
          <JumpToSign />
          <ReadProgress />
        </>
      )}
    </div>
  )
}
