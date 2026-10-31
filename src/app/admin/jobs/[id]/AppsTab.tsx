import Link from 'next/link'
import { addWorkerToJob, approveAllApplied, decideApplication } from '@/app/actions/admin'
import { PositionInput } from '@/components/admin'
import Avatar from '@/components/Avatar'
import { ContactButtons } from '@/components/Contact'
import { GroupContact } from '@/components/GroupContact'
import InvitePast, { type PastWorker } from '@/components/InvitePast'
import { APP_STATUS } from '@/components/JobCard'
import { scoresByUser, StarAvg } from '@/components/Stars'
import { SubmitButton } from '@/components/ui'
import { db, must } from '@/lib/db'
import { reliabilityFor, type Reliability } from '@/lib/reliability'
import { ageOn, fmtDate, kstDate, kstDateTime } from '@/lib/time'
import type { Job } from '@/lib/types'
import type { AppRow } from './page'

/** 지원 상태 바꾸기 버튼 (휴대폰 카드는 넓게, 표는 작게) */
function Decide({ a, wide = false }: { a: AppRow; wide?: boolean }) {
  const btn = (primary: boolean) => `${primary ? 'btn-primary' : 'btn-gray'} ${wide ? 'w-full' : 'btn-sm'}`
  const form = wide ? 'flex-1' : ''
  return (
    <div className={`flex ${wide ? 'gap-2' : 'gap-1'}`}>
      {a.status !== 'approved' && a.status !== 'cancelled' && (
        <form action={decideApplication.bind(null, a.id, 'approved')} className={form}>
          <SubmitButton className={btn(true)} pendingText="…">
            확정
          </SubmitButton>
        </form>
      )}
      {a.status === 'applied' && (
        <form action={decideApplication.bind(null, a.id, 'rejected')} className={form}>
          <SubmitButton className={btn(false)} pendingText="…">
            미선발
          </SubmitButton>
        </form>
      )}
      {(a.status === 'approved' || a.status === 'rejected') && (
        <form action={decideApplication.bind(null, a.id, 'applied')} className={form}>
          <SubmitButton className={btn(false)} pendingText="…">
            대기로
          </SubmitButton>
        </form>
      )}
    </div>
  )
}

/** 예전에 다른 행사에서 일한 근무자 (이 공고에 아직 지원하지 않은 사람, 최근 근무 순 200명까지) */
async function pastWorkers(job: Job, apps: AppRow[]): Promise<PastWorker[]> {
  const rows = must(
    await db().from('attendance').select('user_id').neq('job_id', job.id).order('work_date', { ascending: false }).limit(3000),
  ) as { user_id: string }[]
  const applied = new Set(apps.map((a) => a.user_id))
  const ids = [...new Set(rows.map((r) => r.user_id))].filter((u) => !applied.has(u)).slice(0, 200)
  if (!ids.length) return []
  const [users, rel, ratings] = await Promise.all([
    db()
      .from('users')
      .select('id, name, phone, photo_at, active, role')
      .in('id', ids)
      .then((r) => must(r) as { id: string; name: string; phone: string; photo_at: string | null; active: boolean; role: string }[]),
    reliabilityFor(ids),
    db()
      .from('worker_ratings')
      .select('user_id, score')
      .in('user_id', ids)
      .then((r) => must(r) as { user_id: string; score: number }[]),
  ])
  const scores = scoresByUser(ratings)
  return users
    .filter((u) => u.active && u.role === 'worker')
    .map((u) => {
      const s = scores[u.id]
      return { id: u.id, name: u.name, phone: u.phone, photo_at: u.photo_at, ...rel[u.id], avg: s?.length ? s.reduce((a, b) => a + b, 0) / s.length : null }
    })
    .sort((a, b) => a.noShow - b.noShow || (b.avg ?? 0) - (a.avg ?? 0) || b.days - a.days)
}

export default async function AppsTab({ job, apps, origin }: { job: Job; apps: AppRow[]; origin: string }) {
  const ids = apps.map((a) => a.user_id)
  // 모집 중인 공고면 예전 근무자에게 모집을 알릴 수 있게
  const past = job.status === 'open' && job.end_date >= kstDate() ? await pastWorkers(job, apps) : []
  // 다른 행사에서의 근무·지각·노쇼, 관리자 평가 평균 (근무자에게는 보이지 않음)
  const [rel, ratings] = ids.length
    ? await Promise.all([
        reliabilityFor(ids, job.id),
        db()
          .from('worker_ratings')
          .select('user_id, score')
          .in('user_id', ids)
          .then((r) => must(r) as { user_id: string; score: number }[]),
      ])
    : [{} as Record<string, Reliability>, []]
  const scores = scoresByUser(ratings)
  const relText = (uid: string) => {
    const r = rel[uid]
    if (!r || (r.days === 0 && r.noShow === 0)) return '첫 근무'
    return (
      <>
        근무 {r.days}일{r.late > 0 && ` · 지각 ${r.late}`}
        {r.noShow > 0 && <b className="text-rose-600"> · 노쇼 {r.noShow}</b>}
      </>
    )
  }
  const waiting = apps.filter((a) => a.status === 'applied').length
  const approved = apps.filter((a) => a.status === 'approved')
  const order = { approved: 0, applied: 1, rejected: 2, cancelled: 3 }
  const sorted = [...apps].sort((a, b) => order[a.status] - order[b.status])

  // 휴대폰: 대기는 펼쳐 두고, 확정은 대기가 있으면 접어 둠, 미선발·취소는 접어 둠 (카드가 길어서)
  const mobileCard = (a: AppRow) => {
    const age = a.user.birth_date ? ageOn(a.user.birth_date, job.start_date) : null
    return (
      <div key={a.id} className={`card space-y-2.5 p-4 ${a.status === 'cancelled' || a.status === 'rejected' ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-3">
          <Avatar id={a.user_id} name={a.user.name} photoAt={a.user.photo_at} size="lg" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <Link href={`/admin/workers/${a.user_id}`} className="text-[17px] font-bold">
              {a.user.name}
            </Link>
            {age != null && <span className="text-sm text-mute">만 {age}세</span>}
            {scores[a.user_id] && <StarAvg scores={scores[a.user_id]} />}
            {age != null && age < 18 && <span className="badge bg-rose-50 text-rose-600">연소자</span>}
            <span className={`badge ml-auto ${APP_STATUS[a.status].cls}`}>{APP_STATUS[a.status].label}</span>
          </div>
        </div>
        <p className="text-xs text-mute">
          {relText(a.user_id)} · 지원 {kstDateTime(a.created_at)}
        </p>
        <div className="rounded-xl bg-bg px-3 py-2 text-sm text-sub">
          <p>가능일 {a.available_dates ? a.available_dates.map(fmtDate).join(', ') : '전체'}</p>
          {a.message && <p className="text-ink">“{a.message}”</p>}
        </div>
        <ContactButtons phone={a.user.phone} name={a.user.name} />
        {a.status === 'approved' && <PositionInput appId={a.id} value={a.position} listId={`pos-${job.id}`} />}
        <Decide a={a} wide />
      </div>
    )
  }
  const groups: [string, AppRow[], boolean][] = [
    ['대기', apps.filter((a) => a.status === 'applied'), true],
    ['확정', approved, waiting === 0],
    ['미선발·취소', apps.filter((a) => a.status === 'rejected' || a.status === 'cancelled'), false],
  ]

  return (
    <div className="space-y-4">
      {/* 배치 칸에서 이미 쓴 배치를 골라 넣게 */}
      <datalist id={`pos-${job.id}`}>
        {[...new Set(approved.map((a) => a.position).filter(Boolean))].map((p) => (
          <option key={p} value={p!} />
        ))}
      </datalist>
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
      {past.length > 0 && <InvitePast jobId={job.id} jobTitle={job.title} link={`${origin}/jobs/${job.id}`} workers={past} />}
      {apps.length === 0 ? (
        <div className="card py-10 text-center text-mute">
          아직 지원자가 없습니다. 위의 모집 문구를 단톡방에 공유해 보세요.
        </div>
      ) : (
        <>
          {/* 휴대폰: 카드 (확정·미선발 버튼과 한마디를 옆으로 밀지 않고 바로) */}
          <div className="space-y-2 sm:hidden">
            {groups.map(([label, list, open]) =>
              list.length === 0 ? null : open ? (
                <div key={label} className="stagger space-y-2">
                  {label !== '대기' && <h3 className="pt-2 text-sm font-bold text-sub">{label} {list.length}명</h3>}
                  {list.map(mobileCard)}
                </div>
              ) : (
                <details key={label} className="pt-2">
                  <summary className="cursor-pointer py-1 text-sm font-bold text-sub">
                    {label} {list.length}명
                  </summary>
                  <div className="mt-2 space-y-2">{list.map(mobileCard)}</div>
                </details>
              ),
            )}
          </div>

          <div className="card hidden overflow-x-auto p-0 sm:block">
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
                        <span className="mr-2 inline-block align-middle">
                          <Avatar id={a.user_id} name={a.user.name} photoAt={a.user.photo_at} size="sm" />
                        </span>
                        <Link href={`/admin/workers/${a.user_id}`} className="font-semibold hover:text-brand-600">
                          {a.user.name}
                        </Link>
                        {age != null && <span className="ml-1 text-xs text-mute">만 {age}세</span>}
                        {scores[a.user_id] && (
                          <span className="ml-1">
                            <StarAvg scores={scores[a.user_id]} />
                          </span>
                        )}
                        {age != null && age < 18 && <span className="badge ml-1 bg-rose-50 text-rose-600">연소자</span>}
                        {a.status === 'approved' && (
                          <div className="mt-1">
                            <PositionInput appId={a.id} value={a.position} listId={`pos-${job.id}`} />
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <ContactButtons phone={a.user.phone} name={a.user.name} />
                      </td>
                      <td className="min-w-48 text-xs text-sub">
                        {a.available_dates ? a.available_dates.map(fmtDate).join(', ') : '전체'}
                        {a.message && <div className="mt-0.5 text-ink">“{a.message}”</div>}
                      </td>
                      <td className="text-xs whitespace-nowrap text-sub">
                        {relText(a.user_id)}
                      </td>
                      <td className="text-xs whitespace-nowrap text-mute">{kstDateTime(a.created_at)}</td>
                      <td>
                        <span className={`badge ${APP_STATUS[a.status].cls}`}>{APP_STATUS[a.status].label}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        <Decide a={a} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
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
