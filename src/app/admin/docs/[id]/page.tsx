import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TemplateEditor } from '@/components/admin'
import Flash from '@/components/Flash'
import OtherCompanyJob from '@/components/OtherCompanyJob'
import { rowInMyOtherCompany } from '@/lib/company'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import type { DocTemplate } from '@/lib/types'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '서식 편집' }

export default async function TemplatePage(props: PageProps<'/admin/docs/[id]'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  let tpl: DocTemplate | null = null
  if (id !== 'new') {
    if (!isUuid(id)) notFound()
    const { data } = await db().from('doc_templates').select('*').eq('company_id', admin.companyId).eq('id', id).maybeSingle()
    if (!data) {
      // 내가 맡은 다른 회사의 서식이면: 없는 화면 대신 그 회사로 바꿔서 열기 (정기 개선 2026-11-24 05:35)
      const other = await rowInMyOtherCompany(admin, 'doc_templates', id)
      if (!other) notFound()
      return (
        <OtherCompanyJob
          title="다른 회사 서식이에요"
          company={other}
          now={admin.companyName}
          open={`/admin/docs/${id}`}
          back={{ href: '/admin/docs?tab=tpl', label: '지금 회사 서식 목록으로' }}
        />
      )
    }
    tpl = data as DocTemplate
  }
  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <Link href="/admin/docs?tab=tpl" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 서식 목록
      </Link>
      <h1 className="text-2xl font-extrabold">{tpl ? tpl.title : '새 서식'}</h1>
      <TemplateEditor tpl={tpl} />
    </div>
  )
}
