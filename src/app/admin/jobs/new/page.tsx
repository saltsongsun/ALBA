import type { Metadata } from 'next'
import Link from 'next/link'
import JobForm from '@/components/JobForm'
import { getSettings, hasSeal } from '@/lib/data'
import { db, must } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { missingSetup } from '@/lib/setup'

export const metadata: Metadata = { title: '새 공고' }

export default async function NewJobPage() {
  const admin = await requireAdmin()
  const [settings, sealSet, templates] = await Promise.all([
    getSettings(admin.companyId),
    hasSeal(admin.companyId),
    db()
      .from('doc_templates')
      .select('id, title, kind, is_default').eq('company_id', admin.companyId)
      .eq('active', true)
      .order('created_at')
      .then((r) => must(r) as { id: string; title: string; kind: string; is_default: boolean }[]),
  ])
  // 이 회사의 계약서·명세서에 들어갈 정보가 비어 있으면 올리기 전에 알려 줌 (막지는 않음)
  const missing = missingSetup(settings, sealSet)
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/jobs" className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 공고 목록
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-extrabold">새 공고 등록</h1>
      {missing.length > 0 && (
        <div data-setup-missing className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200/70">
          <p className="font-bold">계약서에 들어갈 회사 정보가 비어 있어요</p>
          <p className="mt-1">
            비어 있는 것: <b>{missing.map((it) => it.label).join(' · ')}</b>
          </p>
          <p className="mt-0.5 text-amber-800">공고는 올릴 수 있지만, 근로계약서·임금명세서에 빈칸으로 나가요.</p>
          {/* 회사 설정의 첫 빈 칸으로 바로 (커서까지) */}
          <Link href={`/admin/settings#${missing[0].key}`} className="mt-2 inline-block font-bold whitespace-nowrap underline underline-offset-2">
            회사 설정에서 채우기 →
          </Link>
        </div>
      )}
      <JobForm job={null} templates={templates} defaults={{ hourly_wage: settings.default_hourly_wage, premium: settings.workplace_5plus }} />
    </div>
  )
}
