import Link from 'next/link'
import { decideApplication } from '@/app/actions/admin'
import AutoRefresh from '@/components/AutoRefresh'
import { ContactButtons } from '@/components/Contact'
import Flash from '@/components/Flash'
import { SubmitButton } from '@/components/ui'
import { countApps, getSettings, hasSeal, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { requireAdmin } from '@/lib/session'
import { ageOn, fmtDate, fmtDateRange, kstDate, kstDateTime } from '@/lib/time'

function Stat({ label, value, href, tone = '' }: { label: string; value: number; href: string; tone?: string }) {
  return (
    <Link href={href} className="card block py-4 transition hover:ring-2 hover:ring-brand-100">
      <p className="text-sm font-semibold text-mute">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold ${tone}`}>{value}</p>
    </Link>
  )
}

export default async function AdminHome(props: PageProps<'/admin'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const today = kstDate()
  const [settings, sealSet, activeJobs, pending, working, pendingDocs, workerCount] = await Promise.all([
    getSettings(),
    hasSeal(),
    db()
      .from('jobs')
      .select(JOB_WITH_APP_STATUS)
      .in('status', ['open', 'closed'])
      .gte('end_date', today)
      .order('start_date')
      .then((r) => must(r) as JobWithAppStatus[]),
    db()
      .from('applications')
      .select('id, created_at, message, available_dates, job:jobs(id, title, end_date), user:users(id, name, phone, birth_date)')
      .eq('status', 'applied')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(
        (r) =>
          must(r) as unknown as {
            id: string
            created_at: string
            message: string | null
            available_dates: string[] | null
            job: { id: string; title: string; end_date: string }
            user: { id: string; name: string; phone: string; birth_date: string | null }
          }[],
      ),
    db().from('attendance').select('job_id').is('clock_out', null).then((r) => must(r) as { job_id: string }[]),
    db().from('signed_docs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db().from('users').select('id', { count: 'exact', head: true }).eq('role', 'worker').eq('active', true),
  ])
  const counts = countApps(activeJobs, 'approved')
  const todayJobs = activeJobs.filter((j) => j.start_date <= today && j.end_date >= today)
  const workingBy: Record<string, number> = {}
  for (const w of working) workingBy[w.job_id] = (workingBy[w.job_id] ?? 0) + 1
  const pendingApps = pending.filter((p) => p.job && p.job.end_date >= today)
  const setupTodo = [
    !settings.business_no && '사업자등록번호',
    !settings.company_address && '회사 주소',
    !sealSet && '직인 이미지',
    !settings.contact_phone && '문의 연락처',
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      <Flash m={sp.m} />
      {setupTodo.length > 0 && (
        <Link href="/admin/settings" className="block rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <b>회사 설정을 마무리해 주세요:</b> {setupTodo.join(', ')} — 근로계약서·임금명세서에 들어갑니다. →
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold">{fmtDate(today)} 현황</h1>
          <AutoRefresh />
        </div>
        <Link href="/admin/jobs/new" className="btn-primary">
          + 새 공고 등록
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="지금 근무 중" value={working.length} href="/admin/jobs" tone="text-emerald-600" />
        <Stat label="확정 대기 지원" value={pendingApps.length} href="#pending" tone="text-amber-600" />
        <Stat label="서명 대기 서류" value={pendingDocs.count ?? 0} href="/admin/jobs" />
        <Stat label="가입 근무자" value={workerCount.count ?? 0} href="/admin/workers" />
      </div>

      <section>
        <h2 className="section-title">오늘 진행 행사</h2>
        {todayJobs.length === 0 ? (
          <div className="card text-center text-mute">오늘 진행하는 행사가 없습니다.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {todayJobs.map((j) => (
              <Link key={j.id} href={`/admin/jobs/${j.id}?tab=att&date=${today}`} className="card block hover:ring-2 hover:ring-brand-100">
                <p className="font-bold">{j.title}</p>
                <p className="text-sm text-sub">
                  {scheduleText(j)} · {j.location_name}
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-bold text-emerald-600">근무 중 {workingBy[j.id] ?? 0}명</span>
                  <span className="text-mute"> / 확정 {counts[j.id] ?? 0}명 · 모집 {j.headcount}명</span>
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="pending">
        <h2 className="section-title">확정 대기 지원자</h2>
        {pendingApps.length === 0 ? (
          <div className="card text-center text-mute">대기 중인 지원이 없습니다.</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>지원자</th>
                  <th>공고</th>
                  <th>가능일 · 한마디</th>
                  <th>지원 시각</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendingApps.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">
                      <Link href={`/admin/workers/${p.user.id}`} className="font-semibold">
                        {p.user.name}
                      </Link>
                      {p.user.birth_date && <span className="ml-1 text-xs text-mute">만 {ageOn(p.user.birth_date)}세</span>}
                      <div className="mt-1">
                        <ContactButtons phone={p.user.phone} name={p.user.name} />
                      </div>
                    </td>
                    <td>
                      <Link href={`/admin/jobs/${p.job.id}?tab=apps`} className="font-medium">
                        {p.job.title}
                      </Link>
                    </td>
                    <td className="max-w-xs text-xs text-sub">
                      {p.available_dates?.map(fmtDate).join(', ')}
                      {p.message && <div>“{p.message}”</div>}
                    </td>
                    <td className="text-xs whitespace-nowrap text-mute">{kstDateTime(p.created_at)}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex gap-1">
                        <form action={decideApplication.bind(null, p.id, 'approved')}>
                          <SubmitButton className="btn-primary btn-sm" pendingText="…">
                            확정
                          </SubmitButton>
                        </form>
                        <form action={decideApplication.bind(null, p.id, 'rejected')}>
                          <SubmitButton className="btn-gray btn-sm" pendingText="…">
                            미선발
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">진행·예정 공고</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {activeJobs.map((j) => (
            <Link key={j.id} href={`/admin/jobs/${j.id}`} className="card block hover:ring-2 hover:ring-brand-100">
              <p className="font-bold">{j.title}</p>
              <p className="text-sm text-sub">
                {fmtDateRange(j.start_date, j.end_date)} {scheduleText(j)}
              </p>
              <p className="mt-1 text-sm">
                확정 <b>{counts[j.id] ?? 0}</b>/{j.headcount}명
                {j.status === 'closed' && <span className="badge ml-2 bg-gray-100 text-mute">모집마감</span>}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
