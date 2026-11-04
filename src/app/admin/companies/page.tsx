import type { Metadata } from 'next'
import { removeCompanyAdmin, setCompanyActive, setCompanyVerified, switchCompany } from '@/app/actions/company'
import { AddAdminForm, CreateCompanyForm } from '@/components/company'
import { phoneFmt } from '@/lib/format'
import Flash from '@/components/Flash'
import { ConfirmSubmit } from '@/components/ui'
import { platformCompanyId } from '@/lib/data'
import { db, must } from '@/lib/db'
import { requireSuper } from '@/lib/session'
import { companyRatings } from '@/lib/community'
import { kstDate } from '@/lib/time'

export const metadata: Metadata = { title: '회사 관리' }

/** 최고 관리자: 회사 만들기 · 회사별 관리자 초대·빼기 · 회사 사용 중지 */
export default async function CompaniesPage(props: PageProps<'/admin/companies'>) {
  const admin = await requireSuper()
  const sp = await props.searchParams
  const [companies, memberRows, platformId] = await Promise.all([
    db()
      .from('companies')
      .select('id, company_name, ceo_name, business_no, contact_name, contact_phone, active, verified, created_at')
      .order('created_at')
      .then(
        (r) =>
          must(r) as {
            id: string
            company_name: string
            ceo_name: string | null
            business_no: string | null
            contact_name: string | null
            contact_phone: string | null
            active: boolean
            verified?: boolean | null
            created_at: string
          }[],
      ),
    db()
      .from('company_members')
      .select('company_id, user_id, role')
      .then((r) => must(r) as { company_id: string; user_id: string; role: string }[]),
    platformCompanyId(),
  ])
  const ids = [...new Set(memberRows.map((m) => m.user_id))]
  const people = new Map(
    (ids.length ? (must(await db().from('users').select('id, name, phone').in('id', ids)) as { id: string; name: string; phone: string }[]) : []).map(
      (u) => [u.id, u],
    ),
  )
  const members = memberRows.map((m) => ({ ...m, user: people.get(m.user_id) ?? null }))
  // 회사별 한눈에: 모집 중 공고 · 이번 달 출근한 근무자 · 근무자 후기 (못 읽으면 칸만 비움)
  const today = kstDate()
  const monthStart = `${today.slice(0, 7)}-01`
  const [openJobs, monthAtt, ratings] = await Promise.all([
    db()
      .from('jobs')
      .select('company_id, status, end_date')
      .eq('status', 'open')
      .gte('end_date', today)
      .limit(5000)
      .then((r) => (r.data ?? []) as { company_id: string; status: string; end_date: string }[], () => []),
    db()
      .from('attendance')
      .select('company_id, user_id, work_date, clock_in')
      .gte('work_date', monthStart)
      .not('clock_in', 'is', null)
      .limit(20000)
      .then((r) => (r.data ?? []) as { company_id: string; user_id: string; work_date: string; clock_in: string | null }[], () => []),
    companyRatings(companies.map((c) => c.id)),
  ])
  const stats = (id: string) => ({
    open: openJobs.filter((j) => j.company_id === id && j.status === 'open' && j.end_date >= today).length,
    worked: new Set(monthAtt.filter((a) => a.company_id === id && a.clock_in && a.work_date >= monthStart && a.work_date <= today).map((a) => a.user_id)).size,
    rating: ratings[id] ?? null,
  })
  companies.sort((a, b) => a.created_at.localeCompare(b.created_at))
  // 직접 가입해 확인을 기다리는 회사 (확인 전에는 해피워크 전체 회원 명단을 못 봄)
  const waiting = companies.filter((c) => c.active && c.verified === false)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Flash m={sp.m} />
      <div>
        <h1 className="text-2xl font-extrabold">회사 관리</h1>
        <p className="mt-1 text-sm text-sub">
          회사마다 공고·근무자 기록·서류·문의·외주가 따로 관리돼요. 근무자는 한 번 가입하면 모든 회사 공고에 지원할 수 있어요.
        </p>
      </div>

      {waiting.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          🏢 직접 가입해 <b>확인을 기다리는 회사 {waiting.length}곳</b>이 있어요. 담당자에게 연락해 실제 회사인지 확인한 뒤 &lsquo;확인 완료&rsquo;를 눌러 주세요. 확인 전에도 공고·지원자 관리는 쓸 수 있고, 전체 회원 명단만 확인 뒤에 열려요.
        </p>
      )}
      <div className="space-y-3">
        {companies.map((c) => {
          const list = members.filter((m) => m.company_id === c.id)
          const st = stats(c.id)
          return (
            <section key={c.id} className={`card space-y-3 ${c.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">
                    {c.company_name}
                    {c.id === platformId && <span className="badge ml-1.5 bg-brand-50 align-middle text-brand-700">기본 회사</span>}
                    {!c.active && <span className="badge ml-1.5 bg-gray-100 align-middle text-mute">사용 중지</span>}
                    {c.verified === false && <span className="badge ml-1.5 bg-amber-50 align-middle text-amber-700">확인 전</span>}
                  </h2>
                  <p className="text-sm text-sub">{[c.ceo_name && `대표 ${c.ceo_name}`, c.business_no].filter(Boolean).join(' · ') || '회사 정보는 회사 설정에서'}</p>
                  {c.verified === false && (c.contact_name || c.contact_phone) && (
                    <p className="text-sm text-sub">
                      담당 {c.contact_name ?? ''} {c.contact_phone ? phoneFmt(c.contact_phone) : ''} · 가입 {c.created_at.slice(0, 10)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {c.active && (
                    <form action={switchCompany}>
                      <input type="hidden" name="company" value={c.id} />
                      <button className={c.id === admin.companyId ? 'chip-primary' : 'chip'}>{c.id === admin.companyId ? '보는 중' : '이 회사로'}</button>
                    </form>
                  )}
                  {c.verified === false && c.active && (
                    <form action={setCompanyVerified.bind(null, c.id, true)}>
                      <ConfirmSubmit className="chip-primary" confirmText="확인할까요? 전체 회원 명단이 열려요">
                        확인 완료
                      </ConfirmSubmit>
                    </form>
                  )}
                  {c.id !== platformId && (
                    <form action={setCompanyActive.bind(null, c.id, !c.active)}>
                      <ConfirmSubmit className="chip" confirmText={c.active ? '중지할까요? 모집 중 공고는 마감돼요' : '다시 사용할까요?'}>
                        {c.active ? '사용 중지' : '다시 사용'}
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-1.5 rounded-xl bg-bg p-2 text-center" data-company-stats>
                {(
                  [
                    ['모집 중', `${st.open}건`],
                    [`${Number(today.slice(5, 7))}월 근무`, `${st.worked}명`],
                    ['후기', st.rating ? `★${st.rating.avg.toFixed(1)} (${st.rating.count})` : '-'],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-xs text-mute">{k}</dt>
                    <dd className="truncate font-bold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-sub">관리자 {list.length}명</h3>
                {list.length === 0 ? (
                  <p className="text-sm text-mute">아직 관리자가 없어요. 아래에서 초대해 주세요.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-xl bg-bg px-3">
                    {list.map((m) => (
                      <li key={m.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0">
                          <b>{m.user?.name ?? '알 수 없음'}</b>{' '}
                          <span className="whitespace-nowrap text-mute">{m.user ? phoneFmt(m.user.phone) : ''}</span>
                          {m.role === 'owner' && <span className="badge ml-1 bg-ink text-white">대표</span>}
                        </span>
                        {m.user_id !== admin.id && (
                          <form action={removeCompanyAdmin.bind(null, c.id, m.user_id)} className="shrink-0">
                            <ConfirmSubmit className="text-xs font-semibold text-rose-600" confirmText="뺄까요?">
                              빼기
                            </ConfirmSubmit>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {c.active && <AddAdminForm companyId={c.id} />}
            </section>
          )
        })}
      </div>

      <section className="card space-y-3">
        <h2 className="section-title mb-0">새 회사 만들기</h2>
        <CreateCompanyForm />
      </section>
    </div>
  )
}
