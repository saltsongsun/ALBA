import Link from 'next/link'
import { decideApplication } from '@/app/actions/admin'
import AutoRefresh from '@/components/AutoRefresh'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import LiveNumber from '@/components/LiveNumber'
import { SubmitButton } from '@/components/ui'
import { countApps, getSettings, hasSeal, JOB_WITH_APP_STATUS, type JobWithAppStatus } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { requireAdmin } from '@/lib/session'
import { ageOn, fmtDate, fmtDateRange, kstDate, kstDateTime } from '@/lib/time'

const ICONS = {
  working: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  pending: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" />,
  docs: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />,
  people: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
}

function Stat({ label, value, href, icon, tone }: { label: string; value: number; href: string; icon: keyof typeof ICONS; tone: string }) {
  return (
    <Link href={href} className="card-link block py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-mute">{label}</p>
        <span className={`grid size-8 place-items-center rounded-full ${tone}`}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {ICONS[icon]}
          </svg>
        </span>
      </div>
      <p className="mt-1 text-3xl font-extrabold">
        <LiveNumber value={value} />
      </p>
    </Link>
  )
}

/** 비율 막대 (자동 갱신으로 값이 바뀌면 부드럽게 늘고 줄어듦) */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100))
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg">
      <div className={`h-full origin-left animate-grow rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
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
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="지금 근무 중" value={working.length} href="/admin/jobs" icon="working" tone="bg-emerald-50 text-emerald-600" />
        <Stat label="확정 대기 지원" value={pendingApps.length} href="#pending" icon="pending" tone="bg-amber-50 text-amber-600" />
        <Stat label="서명 대기 서류" value={pendingDocs.count ?? 0} href="/admin/jobs" icon="docs" tone="bg-brand-50 text-brand-600" />
        <Stat label="가입 근무자" value={workerCount.count ?? 0} href="/admin/workers" icon="people" tone="bg-gray-100 text-sub" />
      </div>

      <section>
        <h2 className="section-title">오늘 진행 행사</h2>
        {todayJobs.length === 0 ? (
          <Empty icon="🗓️" title="오늘 진행하는 행사가 없습니다" />
        ) : (
          <div className="stagger grid gap-3 md:grid-cols-2">
            {todayJobs.map((j) => (
              <Link key={j.id} href={`/admin/jobs/${j.id}?tab=att&date=${today}`} className="card-link block">
                <p className="font-bold">{j.title}</p>
                <p className="text-sm text-sub">
                  {scheduleText(j)} · {j.location_name}
                </p>
                <p className="mt-3 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-bold text-emerald-600">
                    근무 중 <LiveNumber value={workingBy[j.id] ?? 0} />명
                  </span>
                  <span className="text-mute">
                    확정 {counts[j.id] ?? 0}명 · 모집 {j.headcount}명
                  </span>
                </p>
                <Bar value={workingBy[j.id] ?? 0} max={counts[j.id] ?? 0} color="bg-emerald-500" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="pending">
        <h2 className="section-title">확정 대기 지원자</h2>
        {pendingApps.length === 0 ? (
          <Empty icon="📭" title="대기 중인 지원이 없습니다" />
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
        <div className="stagger grid gap-3 md:grid-cols-2">
          {activeJobs.map((j) => (
            <Link key={j.id} href={`/admin/jobs/${j.id}`} className="card-link block">
              <p className="font-bold">{j.title}</p>
              <p className="text-sm text-sub">
                {fmtDateRange(j.start_date, j.end_date)} {scheduleText(j)}
              </p>
              <p className="mt-1 text-sm">
                확정 <b>{counts[j.id] ?? 0}</b>/{j.headcount}명
                {j.status === 'closed' && <span className="badge ml-2 bg-gray-100 text-mute">모집마감</span>}
              </p>
              <Bar value={counts[j.id] ?? 0} max={j.headcount} color="bg-brand-500" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
