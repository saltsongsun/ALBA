import Link from 'next/link'
import { rerequestDoc, voidDoc } from '@/app/actions/admin'
import { GroupContact } from '@/components/GroupContact'
import { ConfirmSubmit } from '@/components/ui'
import { kstDateTime } from '@/lib/time'
import type { Job, SignedDoc } from '@/lib/types'
import type { AppRow, WorkerLite } from './page'

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-sub">
          서명 완료 <b className="text-ink">{signedCount}</b> / {live.length}건
        </p>
        <div className="flex flex-wrap gap-2">
          <GroupContact
            phones={unsigned.map((u) => users.get(u)?.phone)}
            label={`서명 안 한 ${unsigned.length}명에게 문자`}
            body={`[${job.title}] 근무 전에 근로계약서 등 서류에 서명해 주세요.\n${origin}/me`}
          />
          <Link href={`/admin/jobs/${job.id}/edit#docs`} className="btn-gray btn-sm">
            필요 서류 바꾸기
          </Link>
        </div>
      </div>
      {cols.length === 0 ? (
        <div className="card py-10 text-center text-mute">이 공고에는 서명받을 서류가 지정되어 있지 않습니다.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
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
