import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TemplateEditor } from '@/components/admin'
import Icon from '@/components/Icon'
import Flash from '@/components/Flash'
import OtherCompanyJob from '@/components/OtherCompanyJob'
import { rowInMyOtherCompany } from '@/lib/company'
import { db } from '@/lib/db'
import { templateUse } from '@/lib/templateUse'
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
  // 이 서식을 쓰는 진행 중 공고 · 아직 서명 안 한 서류 (서명 전 서류는 열 때 지금 서식으로 그려져서, 고치면 그대로 바뀜) — 정기 개선 2026-11-24 07:35
  const use = tpl ? await templateUse(admin.companyId, tpl.id) : null
  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <Link href="/admin/docs?tab=tpl" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 서식 목록
      </Link>
      <h1 className="text-2xl font-extrabold">{tpl ? tpl.title : '새 서식'}</h1>
      {use && (use.jobs.length > 0 || use.pending > 0) && (
        <section className="card space-y-2.5 px-4 py-3 text-sm" data-tpl-usage>
          {use.jobs.length > 0 && (
            <>
              <p className="flex items-center gap-2">
                <Icon name="file" className="shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1">
                  진행 중 공고 <b className="tabular-nums">{use.jobs.length}</b>개에서 써요
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5" data-tpl-jobs>
                {use.jobs.slice(0, 3).map((j) => (
                  <Link key={j.id} href={`/admin/jobs/${j.id}?tab=docs`} className="chip max-w-full animate-[pop_0.25s_var(--ease-spring)_both]" data-tpl-job={j.id}>
                    <span className="truncate">{j.title}</span>
                  </Link>
                ))}
                {use.jobs.length > 3 && <span className="self-center text-xs text-mute">외 {use.jobs.length - 3}개</span>}
              </div>
            </>
          )}
          {use.pending > 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900" data-tpl-pending={use.pending}>
              서명 기다리는 <b className="tabular-nums">{use.pending}</b>건은 고친 내용으로 받아요
            </p>
          )}
        </section>
      )}
      <TemplateEditor tpl={tpl} />
    </div>
  )
}
