import type { Metadata } from 'next'
import Link from 'next/link'
import { copyTemplate, restoreDefaultTemplates } from '@/app/actions/admin'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import Fold from '@/components/Fold'
import Icon from '@/components/Icon'
import { SubmitButton } from '@/components/ui'
import { db, must } from '@/lib/db'
import { templateJobCounts } from '@/lib/templateUse'
import { companyDocs, DOC_KIND_LABEL, DOC_LIMIT, filterQuery, parseDocFilter, type DocFilter, type DocRow } from '@/lib/docList'
import { requireAdmin } from '@/lib/session'
import { fmtDate, fmtDateRange, kstDate, kstDateTime } from '@/lib/time'
import type { DocTemplate } from '@/lib/types'
import SearchInput from '@/components/SearchInput'

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
      {tpl ? (
        <Templates companyId={admin.companyId} others={admin.companies.filter((c) => c.id !== admin.companyId && c.role !== 'super')} />
      ) : (
        <Signed companyId={admin.companyId} f={parseDocFilter(sp)} />
      )}
    </div>
  )
}

/** 서명 받은 서류: 공고별로 묶고, 하나씩 또는 거른 것 전체를 PDF로 */
async function Signed({ companyId, f }: { companyId: string; f: DocFilter }) {
  // 서명한 뒤에 그 공고의 '🔔 일정 변경' 알림을 받은 근무자의 서류 → '일정 바뀜' (그 공고 서류 탭에서 재서명 판단 · 정기 개선 2026-11-22 04:35)
  //   알림 시각은 서류 목록 안에서 이름·공고와 함께 읽음 (차례로 기다리지 않게 · 속도 개선 2026-11-22)
  const { rows, base, all, changes } = await companyDocs(companyId, f, { changes: true })
  const stale = (d: DocRow) => d.status === 'signed' && !!d.signed_at && !!d.job_id && (changes.get(`${d.job_id}:${d.user_id}`) ?? '') > d.signed_at
  // 근무가 이미 시작됐는데 아직 서명 안 한 서류 (계약서 없이 일하는 중 · 가장 급한 것 · 정기 개선 2026-11-23 12:35)
  const today = kstDate()
  const late = (d: DocRow) => d.status === 'pending' && !!d.job && d.job.start_date <= today
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
  // '서명 대기'만 볼 때: 근무가 이미 시작된 공고 묶음을 맨 위로 (가장 급한 것부터 · 나머지 순서는 그대로)
  const entries = [...groups.entries()]
  if (f.status === 'pending') entries.sort((x, y) => Number(y[1].some(late)) - Number(x[1].some(late)))
  const filtered = !!(f.q || f.job || f.status || f.kind)
  // 공고 묶음은 처음엔 접어 둠 (공고가 하나뿐이거나 이름·공고로 찾는 중이면 펼침)
  const openAll = groups.size <= 1 || !!(f.q || f.job)
  const total = (f.status ? base.filter((d) => d.status === f.status) : base.filter((d) => d.status !== 'void')).length

  // 서류를 한 번도 받은 적 없는 회사 (새 회사): 빈 찾기 칸·고르기·0개 칩 대신 다음에 할 일 하나만
  if (all.length === 0 && !filtered) return <FirstDocs companyId={companyId} />

  return (
    <>
      <form className="space-y-2" role="search" data-docs-search>
        {f.status && <input type="hidden" name="status" value={f.status} />}
        <div className="flex gap-1.5">
          <SearchInput name="q" enterKeyHint="search" defaultValue={f.q} className="input py-2 text-sm" placeholder="이름·번호·서류·공고로 찾기" aria-label="서류 찾기" />
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
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold tabular-nums transition active:scale-95 ${f.status === c.status ? (c.status === 'pending' ? 'bg-amber-500 text-white' : 'bg-ink text-white') : 'bg-white text-sub ring-1 ring-line'}`}
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
          {/* 보이는 서류 전체를 한 PDF로 (서류마다 새 쪽 → 그대로 인쇄) · '서명 대기'만 볼 때는 뺌 (아직 받을 서류라 인쇄보다 서명 요청이 먼저) */}
          {f.status !== 'pending' && (
          <div className="card flex items-center gap-3 p-3.5" data-docs-bulk>
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Icon name="printer" />
            </span>
            <p className="min-w-0 flex-1 text-sm">
              <b className="block">보이는 서류 {rows.length}건</b>
              <span className="text-[13px] text-sub">한 파일로 받아 바로 인쇄해요</span>
            </p>
            {rows.length <= 300 ? (
              <a href={`/admin/docs/pdf${filterQuery(f)}`} download className="btn-primary btn-sm shrink-0" data-docs-bulk-pdf data-track="서류 PDF 한꺼번에">
                PDF 받기
              </a>
            ) : (
              <span className="shrink-0 text-xs text-mute">300건까지 · 공고로 좁혀 주세요</span>
            )}
          </div>
          )}
          {total > DOC_LIMIT && <p className="text-xs text-mute">최근 {DOC_LIMIT}건만 보여요. 공고나 이름으로 좁혀 보세요.</p>}
          {/* 거르기(상태·공고·종류·찾기)를 바꾸면 목록이 살짝 올라옴 (0.25초 · 움직임 줄이기면 바로) */}
          <div key={filterQuery(f)} className="animate-[rise_0.25s_var(--ease-spring)_both] space-y-3" data-docs-list>
            {entries.map(([jobId, list]) => {
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
                          const lateN = list.filter(late).length
                          const changed = list.filter(stale).length
                          return (
                            <>
                              {/* 좁은 화면에서 줄이 바뀌어도 '일정 바뀜 1'처럼 한 덩어리는 끊기지 않게 */}
                              {signed > 0 && <span className="whitespace-nowrap text-emerald-700"> · 서명 {signed}</span>}
                              {waiting > 0 && (
                                <span className={`font-semibold whitespace-nowrap ${lateN > 0 ? 'text-rose-600' : 'text-amber-700'}`} data-docs-job-waiting={lateN > 0 ? 'late' : 'wait'}>
                                  {' '}
                                  · 대기 {waiting}
                                </span>
                              )}
                              {changed > 0 && (
                                <span className="font-semibold whitespace-nowrap text-amber-700" data-docs-job-stale={changed}>
                                  {' '}
                                  · 일정 바뀜 {changed}
                                </span>
                              )}
                            </>
                          )
                        })()}
                      </p>
                    </div>
                    {f.status === 'pending' ? (
                      // 서명 대기만 볼 때: PDF 대신 그 공고 서류 탭 '서명 안 한 n명'으로 (앱 알림 버튼이 번쩍)
                      job && (
                        <Link href={`/admin/jobs/${jobId}?tab=docs#unsigned`} className="chip h-8 shrink-0 bg-amber-50 px-3 text-xs font-bold text-amber-800" data-docs-job-nudge>
                          서명 요청 ›
                        </Link>
                      )
                    ) : (
                      list.length > 1 && (
                        <a href={`/admin/docs/pdf${filterQuery({ ...f, job: jobId })}`} download className="chip h-8 shrink-0 px-3 text-xs" data-docs-job-pdf>
                          <Icon name="printer" /> PDF
                        </a>
                      )
                    )}
                  </summary>
                  {/* 펼치면 서류 줄이 0.2초 내려오며 나타남 (움직임 줄이기면 바로) */}
                  <ul className="animate-[slide-down_0.2s_ease-out_both] divide-y divide-line" data-docs-job-list>
                    {list.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 px-4 py-3" data-doc-row={d.id}>
                        <div className="min-w-0 flex-1">
                          <p className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-semibold">{d.worker?.name ?? '(탈퇴)'}</span>
                            <span className="truncate text-sm text-sub">{d.title}</span>
                          </p>
                          <p className="text-xs">
                            {d.status === 'signed' ? (
                              <>
                                <span className="text-emerald-700">✓ 서명 {d.signed_at ? kstDateTime(d.signed_at) : ''}</span>
                                {stale(d) && (
                                  <Link href={`/admin/jobs/${d.job_id}?tab=docs#doc-stale`} className="ml-1.5 font-semibold whitespace-nowrap text-amber-700 underline" data-doc-row-stale>
                                    일정 바뀜 ›
                                  </Link>
                                )}
                              </>
                            ) : late(d) ? (
                              // 근무가 시작됐는데 서명 전: 빨갛게 + 눌러서 그 공고 서류 탭 '서명 안 한 사람' (앱 알림 버튼이 번쩍)
                              <Link href={`/admin/jobs/${d.job_id}?tab=docs#unsigned`} className="tap font-semibold whitespace-nowrap text-rose-600" data-doc-row-late>
                                서명 안 함 · {d.job!.end_date < today ? '근무 끝남' : '근무 시작됨'} ›
                              </Link>
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
                        {/* 서명 전 서류는 PDF 대신 보기만 (받을 서류라 인쇄할 일이 거의 없음) */}
                        {d.status !== 'pending' && (
                          <a href={`/admin/docs/pdf?id=${d.id}`} download className="chip h-8 shrink-0 px-3 text-xs font-bold text-brand-700" data-doc-pdf data-track="서류 PDF 한 건">
                            PDF
                          </a>
                        )}
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

/**
 * 아직 받은 서류가 하나도 없는 회사: 어떻게 모이는지 한 줄 + 다음에 할 일 하나
 * · 공고가 없으면 '첫 공고 올리기' · 있으면 서식 확인 (준비된 서식 수 · 없으면 기본 서식 불러오기)
 */
async function FirstDocs({ companyId }: { companyId: string }) {
  const [jobs, tpls] = await Promise.all([
    db().from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).then((r) => r.count ?? 0, () => 0),
    db()
      .from('doc_templates')
      .select('id, active')
      .eq('company_id', companyId)
      .then((r) => ((r.data ?? []) as { id: string; active: boolean | null }[]).filter((t) => t.active !== false).length, () => 0),
  ])
  return (
    <section className="card flex flex-col items-center gap-3 py-8 text-center" data-docs-first>
      <span aria-hidden className="animate-float text-4xl">
        📄
      </span>
      <div className="space-y-1">
        <p className="font-semibold text-sub">아직 받은 서류가 없어요</p>
        <p className="text-sm text-balance text-mute">확정된 근무자가 앱에서 서명하면 여기에 모여요</p>
      </div>
      {jobs === 0 ? (
        <Link href="/admin/jobs/new" className="btn-primary btn-sm animate-pop" data-docs-first-job>
          + 첫 공고 올리기
        </Link>
      ) : null}
      {tpls > 0 ? (
        <Link href="/admin/docs?tab=tpl" className="tap text-sm font-semibold text-brand-600" data-docs-first-tpl>
          서식 {tpls}개 준비돼 있어요 · 보기 →
        </Link>
      ) : (
        <form action={restoreDefaultTemplates} data-docs-first-restore>
          <SubmitButton className="btn-gray btn-sm">
            기본 서식 불러오기
          </SubmitButton>
        </form>
      )}
    </section>
  )
}

/** 서식 목록 (예전 '서류 서식' 화면) */
async function Templates({ companyId, others }: { companyId: string; others: { id: string; name: string }[] }) {
  const [tpls, using, theirs] = await Promise.all([
    db().from('doc_templates').select('*').eq('company_id', companyId).order('created_at').then((r) => must(r) as DocTemplate[]),
    // 서식마다 지금 쓰는 진행 중 공고 수 (고치기 전에 어디에 영향이 가는지) — 정기 개선 2026-11-24 07:35
    templateJobCounts(companyId),
    // 내가 맡은 다른 회사의 쓰는 서식 (가져오기 목록 · 관리자로 속한 회사만) — 정기 개선 2026-11-24 09:35
    others.length
      ? db()
          .from('doc_templates')
          .select('id, company_id, title, kind, active')
          .in('company_id', others.map((c) => c.id))
          .order('created_at')
          .limit(100)
          .then((r) => ((r.data ?? []) as { id: string; company_id: string; title: string; kind: DocTemplate['kind']; active: boolean }[]).filter((t) => t.active && others.some((c) => c.id === t.company_id)))
      : [],
  ])
  const nameOf = new Map(others.map((c) => [c.id, c.name]))
  const mineTitles = new Set(tpls.map((t) => t.title))
  return (
    <>
      {/* 설명은 한 줄 + 자세히 (정기 개선 2026-11-24 09:35 · '설명은 짧게 하거나 접어 두기') */}
      <div className="text-sm text-sub" data-tpl-intro>
        <p>공고마다 확정 인원에게 서명받을 서류를 골라요.</p>
        <details className="group mt-0.5 text-xs text-mute">
          <summary className="tap inline-flex cursor-pointer items-center font-semibold">자세히</summary>
          <p className="mt-1 animate-[slide-down_0.25s_ease-out_both] text-sub">
            근무자는 앱에서 내용을 읽고 손가락으로 서명해요. 서명한 때의 내용·회사 직인·서명 시각·IP가 함께 보관돼요.
          </p>
        </details>
      </div>
      {theirs.length > 0 && (
        <div data-tpl-import>
          <Fold
            title="다른 회사 서식 가져오기"
            badge={<span className="text-sm font-semibold text-mute">· {theirs.length}개</span>}
            summary="내가 맡은 다른 회사 서식을 이 회사로 복사해요"
            className="space-y-2"
          >
            <p className="text-xs text-sub">원래 서식은 그대로예요</p>
            <ul className="divide-y divide-line">
              {theirs.map((t, i) => (
                <li
                  key={t.id}
                  className="flex animate-[rise_0.25s_var(--ease-spring)_both] items-center gap-3 py-2.5"
                  style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}
                  data-tpl-src={t.id}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-mute">
                      {nameOf.get(t.company_id)} · {KIND[t.kind]}
                    </span>
                    {/* 같은 이름이 이미 있으면 제목 옆에 짧게 (가져오면 '(회사 이름에서)'가 붙음) */}
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold">{t.title}</span>
                      {mineTitles.has(t.title) && (
                        <span className="badge shrink-0 bg-bg text-sub" data-tpl-same>
                          같은 이름
                        </span>
                      )}
                    </span>
                  </span>
                  <form action={copyTemplate} className="shrink-0">
                    <input type="hidden" name="id" value={t.id} />
                    <SubmitButton className="btn-soft btn-sm" pendingText="가져오는 중…">
                      가져오기
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Fold>
        </div>
      )}
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
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
              <span>수정 {fmtDate(kstDate(t.updated_at))}</span>
              {(using.get(t.id) ?? 0) > 0 && (
                <span className="font-semibold whitespace-nowrap text-brand-700" data-tpl-used={using.get(t.id)}>
                  · 진행 중 공고 {using.get(t.id)}개에서 써요
                </span>
              )}
            </p>
          </Link>
        ))}
      </div>
      {/* 앱이 자동으로 만드는 서류: 접어 두고 한 줄 (펼치면 네 가지 · 정기 개선 2026-11-24 09:35) */}
      <div data-tpl-auto>
        <Fold title="앱이 자동으로 만드는 서류" badge={<span className="text-sm font-semibold text-mute">· 4가지</span>} className="text-sm text-sub">
          <ul className="list-disc space-y-0.5 pl-5">
            <li>임금명세서 — 근로기준법 제48조에 따른 항목(구성항목·계산방법·공제내역)을 근무 기록에서 자동 작성</li>
            <li>근무확인서 — 근무기간·일수·시간과 회사 직인</li>
            <li>개인정보 수집·이용 동의 — 가입할 때 받으며 동의 시각을 기록</li>
            <li>근로자 명부·정산표·월별 신고자료 — CSV(엑셀)로 내려받기</li>
          </ul>
        </Fold>
      </div>
    </>
  )
}
