import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DocBody } from '@/components/DocSheet'
import { PrintButton } from '@/components/ui'
import { getJob, getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { buildDocVars, renderTemplate } from '@/lib/docs'
import { phoneFmt } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { fmtDateLong } from '@/lib/time'
import type { DocTemplate } from '@/lib/types'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '종이 근로계약서' }

type Person = { id: string; name: string; phone: string; birth_date: string | null; address: string | null }

/**
 * 근로계약서를 종이로 받는 공고: 공고·근무자 정보를 미리 채운 계약서를 한 장씩 인쇄 (관리자만).
 * ?u=근무자 → 그 사람만, ?blank=1 → 근무자 칸을 비운 한 장 (현장에서 새로 온 사람용), 없으면 확정자 모두
 */
export default async function PaperContractPage(props: PageProps<'/print/contract/[jobId]'>) {
  await requireAdmin()
  const { jobId } = await props.params
  const sp = await props.searchParams
  if (!isUuid(jobId)) notFound()
  const blank = sp.blank === '1'
  const only = typeof sp.u === 'string' && isUuid(sp.u) ? sp.u : null

  const [job, settings, templates, apps] = await Promise.all([
    getJob(jobId),
    getSettings({ seal: true }),
    db().from('doc_templates').select('id, kind, title, body, is_default, active').eq('kind', 'contract').then((r) => must(r) as DocTemplate[]),
    db()
      .from('applications')
      .select('user_id, user:users(id, name, phone, birth_date, address)')
      .eq('job_id', jobId)
      .eq('status', 'approved')
      .then((r) => must(r) as unknown as { user_id: string; user: Person | null }[]),
  ])
  if (!job) notFound()
  // 이 공고에 지정한 근로계약서 서식 → 없으면 기본 서식 → 아무 근로계약서 서식
  const contracts = templates.filter((t) => t.kind === 'contract' && t.active !== false)
  const tpl =
    contracts.find((t) => job.required_docs.includes(t.id)) ?? contracts.find((t) => t.is_default) ?? contracts[0] ?? null

  const people: (Person | null)[] = blank
    ? [null]
    : apps
        .map((a) => a.user)
        .filter((u): u is Person => !!u && (!only || u.id === only))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const back = `/admin/jobs/${jobId}?tab=docs`
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={back} className="text-sm font-semibold text-sub">
          ← 돌아가기
        </Link>
        <p className="text-sm text-sub">{blank ? '빈 계약서 1장' : `${people.length}명 · 한 사람에 한 장`}</p>
        {tpl && people.length > 0 && <PrintButton />}
      </div>
      {!tpl ? (
        <div className="card py-10 text-center text-mute">
          근로계약서 서식이 없어요.{' '}
          <Link href="/admin/docs" className="font-semibold text-brand-600">
            서류 서식
          </Link>
          에서 만들어 주세요.
        </div>
      ) : people.length === 0 ? (
        <div className="card py-10 text-center text-mute">확정된 근무자가 없어요. 빈 계약서를 출력해 현장에서 채울 수 있어요.</div>
      ) : (
        people.map((p, i) => {
          const vars = buildDocVars(job, p ?? { name: '', phone: '', birth_date: null, address: null }, settings)
          // 근무자 칸이 비면 손으로 쓰게 밑줄, 작성일도 서명하는 날 손으로
          const blankLine = '　　　　　　　　'
          const filled = {
            ...vars,
            근로자명: p?.name || blankLine,
            생년월일: vars.생년월일 || blankLine,
            연락처: p ? vars.연락처 : blankLine,
            주소: vars.주소 || blankLine,
            작성일: '20　　년　　월　　일',
          }
          return (
            <article key={p?.id ?? 'blank'} className={`print-sheet card px-6 py-8 sm:px-10 ${i < people.length - 1 ? 'break-after-page' : ''}`}>
              <DocBody text={renderTemplate(tpl.body, filled)} />
              <p className="mt-8 text-center font-semibold">20　　년　　월　　일</p>
              <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="mb-1 font-bold">(사업주)</p>
                  <p>상호: {settings.company_name}</p>
                  {settings.business_no && <p>사업자등록번호: {settings.business_no}</p>}
                  {settings.company_address && <p>주소: {settings.company_address}</p>}
                  {settings.company_phone && <p>전화: {settings.company_phone}</p>}
                  <p className="relative">
                    대표자: {settings.ceo_name ?? ''} <span className="text-mute">(인)</span>
                    {settings.seal_image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={settings.seal_image} alt="직인" className="absolute -top-5 left-24 size-16 object-contain mix-blend-multiply" />
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="mb-1 font-bold">(근로자)</p>
                  <p>성명: {p?.name ?? <span className="inline-block w-32 border-b border-ink" />}</p>
                  <p>생년월일: {p?.birth_date ? fmtDateLong(p.birth_date) : <span className="inline-block w-32 border-b border-ink" />}</p>
                  <p>연락처: {p ? phoneFmt(p.phone) : <span className="inline-block w-32 border-b border-ink" />}</p>
                  <p>
                    서명: <span className="inline-block w-32 border-b border-ink" /> <span className="text-mute">(인)</span>
                  </p>
                </div>
              </div>
              <p className="mt-8 border-t border-line pt-3 text-[11px] text-mute">
                근로계약서는 2부를 작성해 사업주와 근로자가 1부씩 보관합니다(근로기준법 제17조). 사업주는 3년간 보관해야 합니다.
              </p>
            </article>
          )
        })
      )}
    </div>
  )
}
