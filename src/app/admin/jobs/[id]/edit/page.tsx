import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Flash from '@/components/Flash'
import JobForm from '@/components/JobForm'
import { getJob, getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '공고 수정' }

export default async function EditJobPage(props: PageProps<'/admin/jobs/[id]/edit'>) {
  await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  const job = isUuid(id) ? await getJob(id) : null
  if (!job) notFound()
  const [settings, templates] = await Promise.all([
    getSettings(),
    db()
      .from('doc_templates')
      .select('id, title, kind, is_default, active')
      .order('created_at')
      .then((r) =>
        (must(r) as { id: string; title: string; kind: string; is_default: boolean; active: boolean }[]).filter(
          (t) => t.active || job.required_docs.includes(t.id),
        ),
      ),
  ])
  return (
    <div className="mx-auto max-w-3xl">
      <Flash m={sp.m} />
      <Link href={`/admin/jobs/${id}`} className="text-sm font-semibold text-sub">
        ← 공고로 돌아가기
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-extrabold">공고 수정</h1>
      <JobForm job={job} templates={templates} defaults={{ hourly_wage: settings.default_hourly_wage, premium: settings.workplace_5plus }} />
    </div>
  )
}
