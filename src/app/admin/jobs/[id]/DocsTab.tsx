import Link from 'next/link'
import { nudgeWorkers, rerequestDoc, setContractReceived, setContractReceivedSelected, voidDoc } from '@/app/actions/admin'
import { PickAll, PickBar } from '@/components/BulkApprove'
import { GroupContact } from '@/components/GroupContact'
import Empty from '@/components/Empty'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { kstDateTime } from '@/lib/time'
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
}: {
  job: Job
  approved: AppRow[]
  docs: DocLite[]
  templates: { id: string; title: string }[]
  users: Map<string, WorkerLite>
  origin: string
}) {
  const live = docs.filter((d) => d.status !== 'void')
  const voided = docs.filter((d) => d.status === 'void')
  const people = [...new Set([...approved.map((a) => a.user_id), ...live.map((d) => d.user_id)])]
  const cols = templates.length
    ? templates
    : [...new Map(live.map((d) => [d.template_id ?? d.title, { id: d.template_id ?? d.title, title: d.title }])).values()]
  const signedCount = live.filter((d) => d.status === 'signed').length
  const unsigned = [...new Set(live.filter((d) => d.status === 'pending').map((d) => d.user_id))]

  // 근로계약서를 종이·다른 서비스(모두싸인 등)로 받는 공고: 사람마다 받았는지 기록
  const outside = job.contract_method !== 'app'
  const contractName = contractNameOf(job.audience)
  const notReceived = approved.filter((a) => !a.contract_received_at)
  // 안 받은 사람이 둘 이상이면 골라서 한 번에 '받음'
  const pickRcv = notReceived.length > 1

  return (
    <div className="space-y-4">
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
        <p className="text-sm text-sub">
          서명 완료 <b className="text-ink">{signedCount}</b> / {live.length}건
        </p>
        <div className="flex flex-wrap gap-2">
          <GroupContact
            phones={unsigned.map((u) => users.get(u)?.phone)}
            label={`서명 안 한 ${unsigned.length}명에게 문자`}
            body={`[${job.title}] 근무 전에 근로계약서 등 서류에 서명해 주세요.\n${origin}/me`}
            copyClassName="btn-white btn-sm"
          />
          {unsigned.length > 0 && (
            <form action={nudgeWorkers.bind(null, job.id, 'sign', null)}>
              <ConfirmSubmit className="btn-soft btn-sm" confirmText={`${unsigned.length}명에게 보낼까요?`}>
                서명 안 한 {unsigned.length}명 앱 알림
              </ConfirmSubmit>
            </form>
          )}
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
                          {d.status === 'signed' ? (
                            <form action={rerequestDoc.bind(null, d.id)}>
                              <ConfirmSubmit className="text-xs font-semibold text-sub underline" confirmText="재서명 요청?">
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
      <p className="text-xs text-mute">
        서명된 서류는 서명 당시 내용으로 보관됩니다. 공고 조건이 바뀌었다면 &lsquo;재서명&rsquo;으로 이전 서류를 무효 처리하고 새로 서명을 받으세요.
        근로계약서는 근로관계 종료 후 3년간 보존해야 합니다.
      </p>
    </div>
  )
}
