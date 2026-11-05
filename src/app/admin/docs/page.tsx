import type { Metadata } from 'next'
import Link from 'next/link'
import { restoreDefaultTemplates } from '@/app/actions/admin'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import Icon from '@/components/Icon'
import { SubmitButton } from '@/components/ui'
import { db, must } from '@/lib/db'
import { companyDocs, DOC_KIND_LABEL, DOC_LIMIT, filterQuery, parseDocFilter, type DocFilter, type DocRow } from '@/lib/docList'
import { requireAdmin } from '@/lib/session'
import { fmtDate, fmtDateRange, kstDate, kstDateTime } from '@/lib/time'
import type { DocTemplate } from '@/lib/types'

export const metadata: Metadata = { title: '서류' }

const KIND = DOC_KIND_LABEL

/** '서류' 메뉴: 서명 받은 서류(기본) | 서식 */
export default async function DocsPage(props: PageProps<'/admin/docs'>) {
  const admin = await requireAdmin()
  const sp = await props.searchParams
  const tpl = sp.tab === 'tpl'
  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">서류</h1>
        {tpl && (
          <div className="flex gap-2">
            <form action={restoreDefaultTemplates}>
              <SubmitButton className="btn-gray btn-sm">기본 서식 불러오기</SubmitButton>
            </form>
            <Link href="/admin/docs/new" className="btn-primary btn-sm">
              + 새 서식
            </Link>
          </div>
        )}
      </div>
      <nav className="flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-line" aria-label="서류 보기" data-docs-tabs>
        {[
          { href: '/admin/docs', label: '서명 받은 서류', on: !tpl },
          { href: '/admin/docs?tab=tpl', label: '서식', on: tpl },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.on ? 'page' : undefined}
            className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold transition active:scale-[0.98] ${t.on ? 'bg-ink text-white' : 'text-sub'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tpl ? <Templates companyId={admin.companyId} /> : <Signed companyId={admin.companyId} f={parseDocFilter(sp)} />}
    </div>
  )
}

/** 서명 받은 서류: 공고별로 묶고, 하나씩 또는 거른 것 전체를 PDF로 */
async function Signed({ companyId, f }: { companyId: string; f: DocFilter }) {
  const { rows, base, all } = await companyDocs(companyId, f)
  const count = (s: DocRow['status']) => base.filter((d) => d.status === s).length
  const chips: { label: string; status: DocFilter['status']; n: number }[] = [
    { label: '전체', status: null, n: base.filter((d) => d.status !== 'void').length },
    { label: '서명 완료', status: 'signed', n: count('signed') },
    { label: '서명 대기', status: 'pending', n: count('pending') },
    ...(count('void') ? [{ label: '무효', status: 'void' as const, n: count('void') }] : []),
  ]
  // 공고 고르기: 서류가 있는 공고 (최근 행사부터)
  const jobs = [...new Map(all.filter((d) => d.job).map((d) => [d.job!.id, d.job!])).values()].sort((a, b) => b.start_date.localeCompare(a.start_date))
  // 공고별로 묶기 (최근 서명·요청 순서 그대로)
  const groups = new Map<string, DocRow[]>()
  for (const d of rows) groups.set(d.job_id, [...(groups.get(d.job_id) ?? []), d])
  const filtered = !!(f.q || f.job || f.status || f.kind)
  // 공고 묶음은 처음엔 접어 둠 (공고가 하나뿐이거나 이름·공고로 찾는 중이면 펼침)
  const openAll = groups.size <= 1 || !!(f.q || f.job)
  const total = (f.status ? base.filter((d) => d.status === f.status) : base.filter((d) => d.status !== 'void')).length

  return (
    <>
      <form className="space-y-2" role="search" data-docs-search>
        {f.status && <input type="hidden" name="status" value={f.status} />}
        <div className="flex gap-1.5">
          <input name="q" defaultValue={f.q} enterKeyHint="search" className="input min-w-0 flex-1 py-2 text-sm" placeholder="이름·번호·서류·공고로 찾기" />
          <button className="btn-gray btn-sm shrink-0">찾기</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <select name="job" defaultValue={f.job ?? ''} className="input min-w-0 py-2 text-sm" aria-label="공고">
            <option value="">모든 공고</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {fmtDate(j.start_date)} {j.title}
              </option>
            ))}
          </select>
          <select name="kind" defaultValue={f.kind ?? ''} className="input min-w-0 py-2 text-sm" aria-label="서류 종류">
            <option value="">모든 서류</option>
            {(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => (
              <option key={k} value={k}>
                {KIND[k]}
              </option>
            ))}
          </select>
        </div>
      </form>
      <div className="flex flex-wrap gap-1.5" data-docs-status>
        {chips.map((c) => (
          <Link
            key={c.label}
            href={`/admin/docs${filterQuery({ ...f, status: c.status })}`}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold tabular-nums ${f.status === c.status ? (c.status === 'pending' ? 'bg-amber-500 text-white' : 'bg-ink text-white') : 'bg-white text-sub ring-1 ring-line'}`}
          >
            {c.label} {c.n}
          </Link>
        ))}
        {filtered && (
          <Link href="/admin/docs" className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-brand-600">
            거르기 지우기
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        filtered ? (
          <Empty icon="🔍" title="맞는 서류가 없어요">
            <Link href="/admin/docs" className="btn-gray btn-sm mt-3 inline-flex">
              거르기 지우기
            </Link>
          </Empty>
        ) : (
          <Empty icon="📄" title="아직 받은 서류가 없어요">
            공고에 서명받을 서류를 고르면, 근무가 확정된 사람이 앱에서 서명한 서류가 여기에 모여요.
          </Empty>
        )
      ) : (
        <>
          {/* 보이는 서류 전체를 한 PDF로 (서류마다 새 쪽 → 그대로 인쇄) */}
          <div className="card flex items-center gap-3 p-3.5" data-docs-bulk>
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Icon name="printer" />
            </span>
            <p className="min-w-0 flex-1 text-sm">
              <b className="block">보이는 서류 {rows.length}건</b>
              <span className="text-[13px] text-sub">한 파일로 받아 바로 인쇄해요</span>
            </p>
            {rows.length <= 300 ? (
              <a href={`/admin/docs/pdf${filterQuery(f)}`} download className="btn-primary btn-sm shrink-0" data-docs-bulk-pdf>
                PDF 받기
              </a>
            ) : (
              <span className="shrink-0 text-xs text-mute">300건까지 · 공고로 좁혀 주세요</span>
            )}
          </div>
          {total > DOC_LIMIT && <p className="text-xs text-mute">최근 {DOC_LIMIT}건만 보여요. 공고나 이름으로 좁혀 보세요.</p>}
          <div className="space-y-3">
            {[...groups.entries()].map(([jobId, list]) => {
              const job = list[0].job
              return (
                <details key={jobId} open={openAll} className="group card overflow-hidden p-0" data-docs-job={jobId}>
                  {/* 공고(프로젝트)마다 접고 펴기: 접으면 공고 이름·건수·PDF만 */}
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 before:hidden group-open:border-b group-open:border-line [&::-webkit-details-marker]:hidden">
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0 -rotate-90 text-mute transition group-open:rotate-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{job?.title ?? '(지운 공고)'}</p>
                      <p className="text-xs text-sub tabular-nums">
                        {job ? fmtDateRange(job.start_date, job.end_date) : ''} · {list.length}건
                        {(() => {
                          const signed = list.filter((d) => d.status === 'signed').length
                          const waiting = list.filter((d) => d.status === 'pending').length
                          return (
                            <>
                              {signed > 0 && <span className="text-emerald-700"> · 서명 {signed}</span>}
                              {waiting > 0 && <span className="font-semibold text-amber-700"> · 대기 {waiting}</span>}
                            </>
                          )
                        })()}
                      </p>
                    </div>
                    {list.length > 1 && (
                      <a href={`/admin/docs/pdf${filterQuery({ ...f, job: jobId })}`} download className="chip h-8 shrink-0 px-3 text-xs" data-docs-job-pdf>
                        <Icon name="printer" /> PDF
                      </a>
                    )}
                  </summary>
                  <ul className="divide-y divide-line">
                    {list.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 px-4 py-3" data-doc-row={d.id}>
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-semibold">{d.worker?.name ?? '(탈퇴)'}</span>
                            <span className="truncate text-sm text-sub">{d.title}</span>
                          </p>
                          <p className="text-xs">
                            {d.status === 'signed' ? (
                              <span className="text-emerald-700">✓ 서명 {d.signed_at ? kstDateTime(d.signed_at) : ''}</span>
                            ) : d.status === 'pending' ? (
                              <span className="font-semibold text-amber-700">서명 대기 · 요청 {fmtDate(kstDate(d.created_at))}</span>
                            ) : (
                              <span className="text-mute">무효</span>
                            )}
                          </p>
                        </div>
                        <Link href={`/docs/${d.id}`} className="chip h-8 shrink-0 px-3 text-xs">
                          보기
                        </Link>
                        <a href={`/admin/docs/pdf?id=${d.id}`} download className="chip h-8 shrink-0 px-3 text-xs font-bold text-brand-700" data-doc-pdf>
                          PDF
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

/** 서식 목록 (예전 '서류 서식' 화면) */
async function Templates({ companyId }: { companyId: string }) {
  const tpls = must(await db().from('doc_templates').select('*').eq('company_id', companyId).order('created_at')) as DocTemplate[]
  return (
    <>
      <p className="text-sm text-sub">
        공고마다 확정 인원에게 서명받을 서류를 고를 수 있습니다. 근무자는 앱에서 내용을 읽고 손가락으로 서명하며, 서명한 시점의 내용·회사 직인·서명 시각·IP가 함께
        보관됩니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {tpls.map((t) => (
          <Link key={t.id} href={`/admin/docs/${t.id}`} className={`card-link block ${t.active ? '' : 'opacity-50'}`}>
            <div className="flex items-center gap-2">
              <span className="badge bg-bg text-sub">{KIND[t.kind]}</span>
              {t.is_default && <span className="badge bg-brand-50 text-brand-700">기본 체크</span>}
              {!t.active && <span className="badge bg-gray-100 text-mute">사용 안 함</span>}
            </div>
            <p className="mt-2 font-bold">{t.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-mute">{t.body.replace(/[#\-{}]/g, '').slice(0, 120)}</p>
            <p className="mt-2 text-xs text-mute">수정 {fmtDate(kstDate(t.updated_at))}</p>
          </Link>
        ))}
      </div>
      <div className="card text-sm text-sub">
        <p className="mb-1 font-bold text-ink">앱이 자동으로 만드는 서류</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>임금명세서 — 근로기준법 제48조에 따른 항목(구성항목·계산방법·공제내역)을 근무 기록에서 자동 작성</li>
          <li>근무확인서 — 근무기간·일수·시간과 회사 직인</li>
          <li>개인정보 수집·이용 동의 — 가입할 때 받으며 동의 시각을 기록</li>
          <li>근로자 명부·정산표·월별 신고자료 — CSV(엑셀)로 내려받기</li>
        </ul>
      </div>
    </>
  )
}
