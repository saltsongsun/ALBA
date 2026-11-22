import Link from 'next/link'
import { smsHead } from '@/lib/format'
import { nudgeWorkers, rerequestDoc, rerequestDocs, setContractReceived, setContractReceivedSelected, voidDoc } from '@/app/actions/admin'
import { PickAll, PickBar } from '@/components/BulkApprove'
import { GroupContact } from '@/components/GroupContact'
import Empty from '@/components/Empty'
import HashFlash from '@/components/HashFlash'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { kstDateTime } from '@/lib/time'
import { nudgeAgo } from '@/lib/nudge'
import { parseChanges } from '@/lib/signals'
import type { Job, SignedDoc } from '@/lib/types'
import type { AppRow, WorkerLite } from './page'
import { contractNameOf } from '@/lib/members'

// 계약서 '받음' 여러 명 한 번에 표시하는 폼 (체크칸이 form 속성으로 묶임)
const RCV_FORM = 'rcv-pick'

type DocLite = Pick<SignedDoc, 'id' | 'user_id' | 'template_id' | 'title' | 'status' | 'signed_at' | 'created_at'>

export default function DocsTab({
  job,
  approved,
  docs,
  templates,
  users,
  origin,
  lastNudge = null,
  company = '',
  missing = [],
  changes = new Map(),
  flashKey = '',
}: {
  job: Job
  approved: AppRow[]
  docs: DocLite[]
  templates: { id: string; title: string }[]
  users: Map<string, WorkerLite>
  origin: string
  /** 이 공고에 마지막으로 보낸 '서명 요청' 앱 알림 시각 (없으면 null) */
  lastNudge?: string | null
  /** 문자 머리에 회사 이름 */
  company?: string
  /** 계약서에 들어갈 회사 정보 중 빈 것 (회사 설정 순서 · 종이·앱 계약서만) */
  missing?: readonly { key: string; label: string }[]
  /** 근무자마다 이 공고로 마지막에 보낸 '🔔 일정 변경' 알림 (우리 회사 문의함) */
  changes?: Map<string, { at: string; body: string }>
  /** 화면 위 안내 글(m) — 바뀌면 '서명 안 한' 칸 번쩍을 다시 */
  flashKey?: string
}) {
  const live = docs.filter((d) => d.status !== 'void')
  const voided = docs.filter((d) => d.status === 'void')
  const people = [...new Set([...approved.map((a) => a.user_id), ...live.map((d) => d.user_id)])]
  const cols = templates.length
    ? templates
    : [...new Map(live.map((d) => [d.template_id ?? d.title, { id: d.template_id ?? d.title, title: d.title }])).values()]
  const signedCount = live.filter((d) => d.status === 'signed').length
  const unsigned = [...new Set(live.filter((d) => d.status === 'pending').map((d) => d.user_id))]
  // 마지막 '서명 요청' 알림 때 (방금 · n분 전 · 오늘 14:02) — 30분 안이면 다시 보낼 때 한 번 더 확인
  const ago = nudgeAgo(lastNudge)
  // 서명한 뒤에 '🔔 일정 변경'을 받은 사람의 서류: 바뀌기 전 내용으로 서명됨 → 재서명할지 확인 (정기 개선 2026-11-22 02:35 · 자동으로 무효 처리하지 않음)
  const staleOf = (d: DocLite) => {
    const c = d.status === 'signed' && d.signed_at ? changes.get(d.user_id) : undefined
    return c && c.at > d.signed_at! ? c : null
  }
  const stale = live.filter((d) => staleOf(d))
  const lastStale = stale.map((d) => staleOf(d)!).reduce<{ at: string; body: string } | null>((a, c) => (!a || c.at > a.at ? c : a), null)
  const staleRows = lastStale ? parseChanges(lastStale.body).slice(0, 2) : []
  const staleNames = [...new Set(stale.map((d) => users.get(d.user_id)?.name).filter(Boolean))] as string[]

  // 근로계약서를 종이·다른 서비스(모두싸인 등)로 받는 공고: 사람마다 받았는지 기록
  const outside = job.contract_method !== 'app'
  const contractName = contractNameOf(job.audience)
  const notReceived = approved.filter((a) => !a.contract_received_at)
  // 안 받은 사람이 둘 이상이면 골라서 한 번에 '받음'
  const pickRcv = notReceived.length > 1

  // 아직 서명이 다 끝나지 않았는데 계약서에 들어갈 회사 정보가 비어 있으면: 서명 전에 채우게 (서명된 서류는 그때 정보 그대로 남음)
  // (앱 서명: 서류가 모두 서명됨 · 종이: 확정자 계약서를 모두 받음)
  const allDone = outside ? approved.length > 0 && notReceived.length === 0 : live.length > 0 && signedCount === live.length
  const showMissing = missing.length > 0 && !allDone
  const missingLabels = missing.map((m) => m.label).join(' · ')

  return (
    <div className="space-y-4">
      {showMissing && (
        <Link
          href={`/admin/settings?job=${job.id}#${missing[0].key}`}
          className="flex animate-pop items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70 transition active:scale-[0.98] motion-reduce:transition-none"
          data-docs-missing={missing.map((m) => m.key).join(' ')}
        >
          <span className="min-w-0 flex-1">
            {/* 둘까지는 이름을 한 줄에, 셋 이상이면 'n곳'만 크게 두고 이름은 아래 작게 */}
            <b className="block truncate" data-docs-missing-head>
              {missing.length <= 2 ? `계약서에 ${missingLabels} 빈칸` : `계약서에 회사 정보 ${missing.length}곳이 빈칸`}
            </b>
            <span className="block text-xs text-pretty text-amber-800" data-docs-missing-sub>
              {missing.length <= 2 ? `${outside ? '출력' : '서명'} 전에 채우면 계약서에 들어가요` : missingLabels}
            </span>
          </span>
          <span className="shrink-0 font-bold whitespace-nowrap">채우기 ›</span>
        </Link>
      )}
      {outside && (
        <>
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold">📝 {contractName} · {job.contract_method === 'paper' ? '종이(서면)로 받기' : '다른 서비스(모두싸인 등)'}</h3>
              <p className="text-sm text-sub">
                받음 <b className="text-ink">{approved.length - notReceived.length}</b> / 확정 {approved.length}명
                {job.contract_url && (
                  <>
                    {' · '}
                    <a href={job.contract_url} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline">
                      서명 링크 열기
                    </a>
                  </>
                )}
              </p>
            </div>
            {notReceived.length > 0 && (
              <form action={nudgeWorkers.bind(null, job.id, 'contract', null)}>
                <ConfirmSubmit className="btn-soft btn-sm" confirmText={`${notReceived.length}명에게 보낼까요?`}>
                  안 받은 {notReceived.length}명 앱 안내
                </ConfirmSubmit>
              </form>
            )}
          </div>
          {/* 종이로 받을 때: 공고·근무자 정보를 미리 채운 계약서를 한 번에 인쇄 */}
          {job.contract_method === 'paper' && (
            <div className="flex flex-wrap gap-1.5">
              {approved.length > 0 && (
                <Link href={`/print/contract/${job.id}`} className="chip-primary">
                  📄 확정 {approved.length}명 계약서 출력
                </Link>
              )}
              <Link href={`/print/contract/${job.id}?blank=1`} className="chip">
                빈 계약서 출력
              </Link>
            </div>
          )}
          {approved.length === 0 ? (
            <p className="text-sm text-mute">확정된 사람이 없어요.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pickRcv && (
                <li className="flex items-center justify-between gap-2 pb-1.5 text-sm font-bold text-sub">
                  안 받은 {notReceived.length}명
                  <PickAll form={RCV_FORM} label="모두 고르기" />
                </li>
              )}
              {approved.map((a) => (
                // 고르면 줄이 파랗게
                <li key={a.id} className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 transition-colors has-checked:bg-brand-50" data-rcv-row>
                  <span className="flex min-w-0 items-center">
                    {pickRcv && !a.contract_received_at && (
                      <label className="mr-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg" aria-label={`${a.user.name} 고르기`}>
                        <input type="checkbox" name="rcv" value={a.id} form={RCV_FORM} className="size-[18px] accent-brand-600" />
                      </label>
                    )}
                    <span className="min-w-0">
                    <span className="font-semibold">{a.user.name}</span>
                    {a.contract_received_at && <span className="ml-2 text-xs text-mute">{kstDateTime(a.contract_received_at)} 받음</span>}
                    {job.contract_method === 'paper' && !a.contract_received_at && (
                      <Link href={`/print/contract/${job.id}?u=${a.user_id}`} className="ml-2 text-xs font-semibold text-brand-600">
                        출력
                      </Link>
                    )}
                    </span>
                  </span>
                  <form action={setContractReceived.bind(null, a.id, !a.contract_received_at)}>
                    <SubmitButton className={a.contract_received_at ? 'badge bg-emerald-50 text-emerald-700' : 'chip-primary h-8 px-3 text-xs'} pendingText="…">
                      {a.contract_received_at ? '받음 ✓' : '받음으로 표시'}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">
            {job.audience === 'expert'
              ? '용역계약서는 일을 시작하기 전에 주고받아 주세요. 받은 계약서는 보관해 주세요.'
              : '근로계약서는 근무 시작 전에 줘야 해요(근로기준법 제17조). 받은 계약서는 3년 동안 보관해 주세요.'}
          </p>
        </section>
        {/* 고른 사람을 한 번에 '받음'으로 */}
        {pickRcv && (
          <PickBar formId={RCV_FORM} action={setContractReceivedSelected.bind(null, job.id)} label="선택 {n}명 받음으로" confirm="{n}명 받음으로 표시할까요?" short="받음" />
        )}
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* 서명 진행: 숫자 아래 얇은 막대가 0에서 차오름 (다 받으면 ✓) */}
        <div className="min-w-0 flex-1 basis-40 space-y-1.5">
          <p className="text-sm text-sub">
            서명 완료 <b className="text-ink">{signedCount}</b> / {live.length}건
            {live.length > 0 && signedCount === live.length && <b className="ml-1 inline-block animate-pop text-emerald-600">✓ 모두</b>}
          </p>
          {live.length > 0 && (
            <div
              className="h-1.5 max-w-48 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label="서명 진행"
              aria-valuenow={Math.round((signedCount / live.length) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              data-signed-bar={`${signedCount}/${live.length}`}
            >
              <div
                className={`h-full origin-left animate-grow rounded-full [animation-delay:0ms] [animation-duration:300ms] ${signedCount === live.length ? 'bg-emerald-500' : 'bg-brand-500'}`}
                style={{ transform: `scaleX(${signedCount / live.length})` }}
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 이 공고의 서명 완료 서류를 한 PDF로 (인쇄·보관) · 전체 목록은 '서류' 메뉴 */}
          {signedCount > 0 && (
            <a href={`/admin/docs/pdf?job=${job.id}&status=signed`} download className="btn-white btn-sm" data-job-docs-pdf>
              서명 완료 {signedCount}건 PDF
            </a>
          )}
          <Link href={`/admin/jobs/${job.id}/edit#docs`} className="btn-white btn-sm">
            필요 서류 바꾸기
          </Link>
        </div>
      </div>
      {/* 서명 안 한 사람에게 연락: 누구에게(서명 안 한 n명)는 한 번만 쓰고 버튼은 짧게 · 마지막 앱 알림 때를 옆에 (같은 알림을 금방 또 보내지 않게) */}
      {unsigned.length > 0 && (
        <div id="unsigned" className="card scroll-mt-24 space-y-2.5 p-3.5" data-unsigned-tools>
          {/* 대시보드 '서명 안 함'으로 왔으면 '앱 알림' 버튼이 화면 가운데에서 번쩍 */}
          {/* 같은 화면에서 일괄 재서명 뒤 돌아왔을 때도 다시 번쩍 (안내 글이 바뀌면 새로 그림) */}
          <HashFlash key={flashKey} id="unsigned" />
          <p className="flex items-baseline justify-between gap-2 text-sm">
            <b className="shrink-0">서명 안 한 {unsigned.length}명</b>
            {ago && (
              <span className={`min-w-0 truncate text-xs ${ago.recent ? 'font-semibold text-amber-700' : 'text-mute'} ${ago.when === '방금' ? 'inline-block animate-pop' : ''}`} data-last-nudge={ago.recent ? 'recent' : 'old'}>
                앱 알림 {ago.when} 보냄
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={nudgeWorkers.bind(null, job.id, 'sign', null)}>
              <ConfirmSubmit className="btn-soft btn-sm" confirmText={ago ? ago.confirm(unsigned.length) : `${unsigned.length}명에게 보낼까요?`}>
                앱 알림
              </ConfirmSubmit>
            </form>
            <GroupContact
              phones={unsigned.map((u) => users.get(u)?.phone)}
              label="문자"
              body={`${smsHead(company, job.title)} 근무 전에 근로계약서 등 서류에 서명해 주세요.\n${origin}/me`}
              className="btn-white btn-sm"
              copyClassName="btn-white btn-sm"
            />
          </div>
        </div>
      )}
      {stale.length > 0 && (
        <div id="doc-stale" className="animate-slide-down scroll-mt-24 space-y-1 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200" data-doc-stale={stale.length}>
          {/* 서류 메뉴 '일정 바뀜 ›'으로 왔으면 이 칸으로 옮겨 번쩍 */}
          <HashFlash id="doc-stale" />
          <p className="font-bold">서명한 뒤 일정이 바뀐 서류 {stale.length}건</p>
          {staleRows.length > 0 && (
            <ul className="space-y-0.5 text-xs" data-doc-stale-changes>
              {staleRows.map((r) => (
                <li key={r.label} className="flex min-w-0 gap-1.5">
                  <span className="shrink-0 font-semibold">{r.label}</span>
                  <span className="min-w-0 truncate">
                    <s className="text-amber-700/70">{r.from}</s> → <b>{r.to}</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs break-keep">
            <span className="font-semibold">{staleNames.slice(0, 3).join(', ')}{staleNames.length > 3 ? ` 외 ${staleNames.length - 3}명` : ''}</span> · 서류에 들어간 내용이 바뀌었으면 {stale.length > 1 ? '한 번에 다시 받거나 표에서' : '표에서'} &lsquo;재서명&rsquo;을 눌러 주세요.
          </p>
          {/* 둘 이상이면 한 번에 (사람이 많을 때 하나씩 누르지 않게) — 정기 개선 2026-11-22 10:35 */}
          {stale.length > 1 && (
            <form action={rerequestDocs.bind(null, job.id, stale.map((d) => d.id))} className="pt-1" data-doc-stale-all>
              <ConfirmSubmit className="btn-white btn-sm w-full text-amber-800" confirmText={`${stale.length}건 모두 다시 받을까요?`}>
                바뀐 {stale.length}건 모두 재서명 요청
              </ConfirmSubmit>
            </form>
          )}
        </div>
      )}
      {cols.length === 0 ? (
        <Empty icon="📄" title="서명받을 서류가 없어요">
          <Link href={`/admin/jobs/${job.id}/edit#docs`} className="font-semibold text-brand-600" data-empty-next="docs">
            {contractNameOf(job.audience)} 등 서류 지정하기 →
          </Link>
        </Empty>
      ) : (
        <div className="card overflow-hidden p-0">
        <div className="fade-r overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                {cols.map((c) => (
                  <th key={c.id}>{c.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((uid) => (
                <tr key={uid}>
                  <td className="font-semibold whitespace-nowrap">{users.get(uid)?.name}</td>
                  {cols.map((c) => {
                    const d = live.find((x) => x.user_id === uid && (x.template_id ?? x.title) === c.id)
                    if (!d) return <td key={c.id} className="text-xs text-mute">-</td>
                    return (
                      <td key={c.id} className="text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {d.status === 'signed' ? (
                            <Link href={`/docs/${d.id}`} className="badge bg-emerald-50 text-emerald-700">
                              서명 {kstDateTime(d.signed_at!)}
                            </Link>
                          ) : (
                            <Link href={`/docs/${d.id}`} className="badge bg-amber-50 text-amber-700">
                              서명 대기
                            </Link>
                          )}
                          {d.status === 'signed' && staleOf(d) && (
                            <span className="badge bg-amber-50 text-amber-700" title="서명한 뒤 일정 변경 알림을 보냈어요" data-doc-stale-cell>
                              일정 바뀜
                            </span>
                          )}
                          {d.status === 'signed' ? (
                            <form action={rerequestDoc.bind(null, d.id)}>
                              <ConfirmSubmit className={`text-xs font-semibold underline ${staleOf(d) ? 'text-amber-700' : 'text-sub'}`} confirmText="재서명 요청?">
                                재서명
                              </ConfirmSubmit>
                            </form>
                          ) : (
                            <form action={voidDoc.bind(null, d.id)}>
                              <ConfirmSubmit className="text-xs font-semibold text-sub underline" confirmText="요청 취소?">
                                취소
                              </ConfirmSubmit>
                            </form>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
      {voided.length > 0 && (
        <details className="text-sm text-sub">
          <summary className="cursor-pointer">무효 처리된 서류 {voided.length}건</summary>
          <ul className="mt-2 space-y-1">
            {voided.map((d) => (
              <li key={d.id}>
                <Link href={`/docs/${d.id}`} className="underline">
                  {users.get(d.user_id)?.name} · {d.title}
                </Link>{' '}
                {d.signed_at && `(서명 ${kstDateTime(d.signed_at)})`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {/* 보관 안내: 한 줄로 · 자세한 건 접어 둠 (정기 개선 2026-11-22 02:35 · 예전 세 문장을 쉬운 말로) */}
      <details className="text-xs text-mute" data-docs-note>
        <summary className="tap cursor-pointer font-semibold">서명한 서류는 그때 내용 그대로 보관돼요</summary>
        <p className="mt-1 animate-[slide-down_0.25s_ease-out_both] break-keep">
          공고 조건이 바뀌었다면 &lsquo;재서명&rsquo;으로 이전 서류를 무효로 하고 새로 서명을 받아요. 근로계약서는 근로관계가 끝난 뒤 3년 동안 보관해야 해요.
        </p>
      </details>
    </div>
  )
}
