import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import DocSheet from '@/components/DocSheet'
import Flash from '@/components/Flash'
import { PrintButton } from '@/components/ui'
import { JumpToSign, SignForm } from '@/components/worker'
import { getJob, getSettings } from '@/lib/data'
import { db } from '@/lib/db'
import { buildDocVars, renderTemplate, type DocPerson } from '@/lib/docs'
import { phoneFmt } from '@/lib/format'
import { requireUser } from '@/lib/session'
import type { CompanySnapshot, DocTemplate, SignedDoc } from '@/lib/types'
import { isUuid } from '@/lib/validate'
import DocGuard from '@/components/DocGuard'
import { viewerMark } from '@/lib/watermark'
import { Fragment } from 'react'

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
  if (!doc || (doc.user_id !== user.id && user.role !== 'admin')) notFound()
  const worker = doc.worker
  if (!worker) notFound()
  const admin = user.role === 'admin'
  // 근무자: 무효가 된 서류(확정을 되돌렸는데 실제로 일하지 않음)나, 확정이 풀렸고 일한 적도 없는 공고의 서류는 내용을 볼 수 없음
  if (!admin) {
    let blocked = doc.status === 'void'
    if (!blocked) {
      const [{ data: app }, { count: worked }] = await Promise.all([
        db().from('applications').select('status').eq('job_id', doc.job_id).eq('user_id', doc.user_id).maybeSingle(),
        db().from('attendance').select('id', { count: 'exact', head: true }).eq('job_id', doc.job_id).eq('user_id', doc.user_id),
      ])
      blocked = (app as { status: string } | null)?.status !== 'approved' && !worked
    }
    if (blocked) {
      return (
        <div className="space-y-4">
          <Link href="/me" className="text-sm font-semibold text-sub">
            ← 내 근무
          </Link>
          <div className="card py-12 text-center">
            <p className="text-3xl" aria-hidden>
              🔒
            </p>
            <p className="mt-2 font-bold">볼 수 없는 서류예요</p>
            <p className="mt-1 text-sm text-sub">근무 확정이 취소돼 이 서류는 무효가 됐어요. 궁금한 점은 문의함으로 물어봐 주세요.</p>
          </div>
        </div>
      )
    }
  }

  let body = doc.body ?? ''
  let company: CompanySnapshot | null = doc.company_snapshot
  let seal = doc.seal_image
  if (doc.status !== 'signed') {
    const [job, settings, { data: tpl }] = await Promise.all([
      getJob(doc.job_id),
      getSettings({ seal: true }),
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
        <Link href={mine ? '/me' : `/admin/jobs/${doc.job_id}?tab=docs`} className="text-sm font-semibold text-sub">
          ← 돌아가기
        </Link>
        {doc.status === 'signed' ? (
          <PrintButton />
        ) : (
          <span className="badge bg-amber-50 text-amber-700">
            서명 대기{queue.length > 1 && pos >= 0 ? ` · ${pos + 1}/${queue.length}` : ''}
          </span>
        )}
      </div>
      {/* 서명할 서류가 여러 건이면 몇 번째인지 */}
      {queue.length > 1 && pos >= 0 && (
        <div className="no-print flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700">
          <span className="font-bold">
            서명할 서류 {pos + 1}/{queue.length}
          </span>
          <span className="flex flex-1 gap-1" aria-hidden>
            {queue.map((d, i) => (
              <span key={d.id} className={`h-1.5 flex-1 rounded-full ${i < pos ? 'bg-brand-600' : i === pos ? 'bg-brand-500' : 'bg-white'}`} />
            ))}
          </span>
        </div>
      )}
      {doc.status === 'void' && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">무효 처리된 서류입니다.</p>}
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
      />
      </Guard>
      {doc.status === 'pending' && mine && (
        <>
          <SignForm docId={doc.id} title={doc.title} userId={user.id} />
          <JumpToSign />
        </>
      )}
    </div>
  )
}
