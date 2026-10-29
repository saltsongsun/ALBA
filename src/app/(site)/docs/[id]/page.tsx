import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import DocSheet from '@/components/DocSheet'
import { PrintButton } from '@/components/ui'
import { SignForm } from '@/components/worker'
import { getJob, getSettings } from '@/lib/data'
import { db } from '@/lib/db'
import { buildDocVars, renderTemplate } from '@/lib/docs'
import { phoneFmt } from '@/lib/format'
import { requireUser } from '@/lib/session'
import type { CompanySnapshot, DocTemplate, SignedDoc } from '@/lib/types'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '서류' }

export default async function DocPage(props: PageProps<'/docs/[id]'>) {
  const { id } = await props.params
  const user = await requireUser(`/docs/${id}`)
  if (!isUuid(id)) notFound()
  const { data } = await db().from('signed_docs').select('*').eq('id', id).maybeSingle()
  const doc = data as SignedDoc | null
  if (!doc || (doc.user_id !== user.id && user.role !== 'admin')) notFound()

  const { data: worker } = await db()
    .from('users')
    .select('name, phone, birth_date, address')
    .eq('id', doc.user_id)
    .single()
  if (!worker) notFound()

  let body = doc.body ?? ''
  let company: CompanySnapshot | null = doc.company_snapshot
  let seal = doc.seal_image
  if (doc.status !== 'signed') {
    const [job, settings, { data: tpl }] = await Promise.all([
      getJob(doc.job_id),
      getSettings(),
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
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={mine ? '/me' : `/admin/jobs/${doc.job_id}?tab=docs`} className="text-sm font-semibold text-sub">
          ← 돌아가기
        </Link>
        {doc.status === 'signed' ? (
          <PrintButton />
        ) : (
          <span className="badge bg-amber-50 text-amber-700">서명 대기</span>
        )}
      </div>
      {doc.status === 'void' && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">무효 처리된 서류입니다.</p>}
      <DocSheet
        docId={doc.id}
        body={body}
        company={company ?? { company_name: '', ceo_name: null, business_no: null, company_address: null, company_phone: null }}
        seal={seal}
        worker={{ name: worker.name, birth_date: worker.birth_date, phone: phoneFmt(worker.phone) }}
        signature={doc.signature}
        signedAt={doc.signed_at}
        signedIp={doc.signed_ip}
      />
      {doc.status === 'pending' && mine && <SignForm docId={doc.id} title={doc.title} />}
    </div>
  )
}
