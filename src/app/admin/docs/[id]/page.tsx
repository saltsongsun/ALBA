import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TemplateEditor } from '@/components/admin'
import Flash from '@/components/Flash'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import type { DocTemplate } from '@/lib/types'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '서식 편집' }

export default async function TemplatePage(props: PageProps<'/admin/docs/[id]'>) {
  await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  let tpl: DocTemplate | null = null
  if (id !== 'new') {
    if (!isUuid(id)) notFound()
    const { data } = await db().from('doc_templates').select('*').eq('id', id).maybeSingle()
    if (!data) notFound()
    tpl = data as DocTemplate
  }
  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <Link href="/admin/docs" className="text-sm font-semibold text-sub">
        ← 서식 목록
      </Link>
      <h1 className="text-2xl font-extrabold">{tpl ? tpl.title : '새 서식'}</h1>
      <TemplateEditor tpl={tpl} />
    </div>
  )
}
