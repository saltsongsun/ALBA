import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Flash from '@/components/Flash'
import JobForm from '@/components/JobForm'
import { getSettings } from '@/lib/data'
import { companyJob } from '@/lib/company'
import { db, must } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '공고 수정' }

export default async function EditJobPage(props: PageProps<'/admin/jobs/[id]/edit'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  if (!isUuid(id)) notFound()
  const [job, settings, allTemplates, approved] = await Promise.all([
    companyJob(admin, id),
    getSettings(admin.companyId),
    db()
      .from('doc_templates')
      .select('id, title, kind, is_default, active').eq('company_id', admin.companyId)
      .order('created_at')
      .then((r) => must(r) as { id: string; title: string; kind: string; is_default: boolean; active: boolean }[]),
    // 지금 확정된 인원 (모집 인원을 그보다 적게 고치면 바로 알려 줌)
    db()
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', admin.companyId)
      .eq('job_id', id)
      .eq('status', 'approved')
      .then((r) => r.count ?? 0, () => 0),
  ])
  if (!job) notFound()
  const templates = allTemplates.filter((t) => t.active || job.required_docs.includes(t.id))
  return (
    <div className="mx-auto max-w-3xl">
      <Flash m={sp.m} />
      <Link href={`/admin/jobs/${id}`} className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 공고로 돌아가기
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-extrabold">공고 수정</h1>
      <JobForm job={job} templates={templates} defaults={{ hourly_wage: settings.default_hourly_wage, premium: settings.workplace_5plus }} approved={approved} />
    </div>
  )
}
