import type { Metadata } from 'next'
import Link from 'next/link'
import JobForm from '@/components/JobForm'
import { getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { requireAdmin } from '@/lib/session'

export const metadata: Metadata = { title: '새 공고' }

export default async function NewJobPage() {
  await requireAdmin()
  const [settings, templates] = await Promise.all([
    getSettings(),
    db()
      .from('doc_templates')
      .select('id, title, kind, is_default')
      .eq('active', true)
      .order('created_at')
      .then((r) => must(r) as { id: string; title: string; kind: string; is_default: boolean }[]),
  ])
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/jobs" className="text-sm font-semibold text-sub">
        ← 공고 목록
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-extrabold">새 공고 등록</h1>
      <JobForm job={null} templates={templates} defaults={{ hourly_wage: settings.default_hourly_wage, premium: settings.workplace_5plus }} />
    </div>
  )
}
