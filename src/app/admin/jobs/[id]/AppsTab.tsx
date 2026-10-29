import Link from 'next/link'
import { addWorkerToJob, approveAllApplied, decideApplication } from '@/app/actions/admin'
import { ContactButtons } from '@/components/Contact'
import { GroupContact } from '@/components/GroupContact'
import { APP_STATUS } from '@/components/JobCard'
import { SubmitButton } from '@/components/ui'
import { db, must } from '@/lib/db'
import { ageOn, fmtDate, kstDateTime } from '@/lib/time'
import type { Job } from '@/lib/types'
import type { AppRow } from './page'

export default async function AppsTab({ job, apps }: { job: Job; apps: AppRow[] }) {
  const ids = apps.map((a) => a.user_id)
  // 다른 행사 근무 이력 (몇 개 행사에서 일했는지)
  const history = ids.length
    ? (must(await db().from('attendance').select('user_id, job_id').in('user_id', ids).neq('job_id', job.id)) as {
        user_id: string
        job_id: string
      }[])
    : []
  const jobsWorked: Record<string, Set<string>> = {}
  for (const h of history) (jobsWorked[h.user_id] ??= new Set()).add(h.job_id)
  const waiting = apps.filter((a) => a.status === 'applied').length
  const approved = apps.filter((a) => a.status === 'approved')
  const order = { approved: 0, applied: 1, rejected: 2, cancelled: 3 }
  const sorted = [...apps].sort((a, b) => order[a.status] - order[b.status])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sub">
          확정 <b className="text-ink">{approved.length}</b> / 모집 {job.headcount}명 · 대기 {waiting}명
        </p>
        <GroupContact phones={approved.map((a) => a.user.phone)} label={`확정 ${approved.length}명에게 문자`} body={`[${job.title}] `} />
        <div className="flex flex-wrap gap-2">
          {waiting > 0 && (
            <form action={approveAllApplied.bind(null, job.id)}>
              <SubmitButton className="btn-primary btn-sm">대기 {waiting}명 모두 확정</SubmitButton>
            </form>
          )}
          <form action={addWorkerToJob.bind(null, job.id)} className="flex gap-1">
            <input name="phone" className="input w-40 py-1.5 text-sm" placeholder="가입자 휴대폰 번호" inputMode="tel" />
            <SubmitButton className="btn-gray btn-sm">직접 추가</SubmitButton>
          </form>
        </div>
      </div>
      {apps.length === 0 ? (
        <div className="card py-10 text-center text-mute">
          아직 지원자가 없습니다. 위의 모집 문구를 단톡방에 공유해 보세요.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>연락처</th>
                <th>가능일 · 한마디</th>
                <th>이력</th>
                <th>지원</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => {
                const age = a.user.birth_date ? ageOn(a.user.birth_date, job.start_date) : null
                return (
                  <tr key={a.id} className={a.status === 'cancelled' || a.status === 'rejected' ? 'opacity-50' : ''}>
                    <td className="whitespace-nowrap">
                      <Link href={`/admin/workers/${a.user_id}`} className="font-semibold hover:text-brand-600">
                        {a.user.name}
                      </Link>
                      {age != null && <span className="ml-1 text-xs text-mute">만 {age}세</span>}
                      {age != null && age < 18 && <span className="badge ml-1 bg-rose-50 text-rose-600">연소자</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      <ContactButtons phone={a.user.phone} name={a.user.name} />
                    </td>
                    <td className="max-w-xs text-xs text-sub">
                      {a.available_dates ? a.available_dates.map(fmtDate).join(', ') : '전체'}
                      {a.message && <div className="mt-0.5 text-ink">“{a.message}”</div>}
                    </td>
                    <td className="text-xs whitespace-nowrap text-sub">
                      {jobsWorked[a.user_id]?.size ? `행사 ${jobsWorked[a.user_id].size}회` : '첫 근무'}
                    </td>
                    <td className="text-xs whitespace-nowrap text-mute">{kstDateTime(a.created_at)}</td>
                    <td>
                      <span className={`badge ${APP_STATUS[a.status].cls}`}>{APP_STATUS[a.status].label}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex gap-1">
                        {a.status !== 'approved' && a.status !== 'cancelled' && (
                          <form action={decideApplication.bind(null, a.id, 'approved')}>
                            <SubmitButton className="btn-primary btn-sm" pendingText="…">
                              확정
                            </SubmitButton>
                          </form>
                        )}
                        {a.status === 'applied' && (
                          <form action={decideApplication.bind(null, a.id, 'rejected')}>
                            <SubmitButton className="btn-gray btn-sm" pendingText="…">
                              미선발
                            </SubmitButton>
                          </form>
                        )}
                        {(a.status === 'approved' || a.status === 'rejected') && (
                          <form action={decideApplication.bind(null, a.id, 'applied')}>
                            <SubmitButton className="btn-gray btn-sm" pendingText="…">
                              대기로
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {apps.some((a) => a.status === 'approved' && a.user.birth_date && ageOn(a.user.birth_date, job.start_date) < 18) && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          만 18세 미만 근무자는 친권자(후견인) 동의서와 가족관계증명서를 받아 두어야 하며(근로기준법 제66조), 하루 7시간·야간(22~06시) 근로 제한이
          있습니다.
        </p>
      )}
    </div>
  )
}
