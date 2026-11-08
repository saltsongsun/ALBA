import SlotBar from '@/components/SlotBar'
import Icon from '@/components/Icon'
import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import { ShareButton } from '@/components/ui'
import { countApps, JOB_WITH_APP_STATUS, unpaidByJob, wageTotals, type JobWithAppStatus } from '@/lib/data'
import { won } from '@/lib/format'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { requireAdmin } from '@/lib/session'
import { fmtDateRange, kstDate } from '@/lib/time'
import type { Job } from '@/lib/types'
import { viewStats } from '@/lib/views'
import SearchInput from '@/components/SearchInput'

export const metadata: Metadata = { title: '공고' }

const STATUS: Record<Job['status'], [string, string]> = {
  open: ['모집중', 'bg-brand-50 text-brand-700'],
  closed: ['모집마감', 'bg-amber-50 text-amber-700'],
  draft: ['임시저장', 'bg-gray-100 text-mute'],
  done: ['종료', 'bg-gray-100 text-mute'],
  cancelled: ['행사 취소', 'bg-rose-50 text-rose-600'],
}

export default async function AdminJobs(props: PageProps<'/admin/jobs'>) {
  const admin = await requireAdmin()
  const sp = await props.searchParams
  const tab = sp.tab === 'past' ? 'past' : sp.tab === 'draft' ? 'draft' : 'active'
  const today = kstDate()
  let q = db().from('jobs').select(JOB_WITH_APP_STATUS).eq('company_id', admin.companyId)
  if (tab === 'active') q = q.in('status', ['open', 'closed']).gte('end_date', today).order('start_date')
  else if (tab === 'draft') q = q.eq('status', 'draft').order('created_at', { ascending: false })
  else q = q.or(`status.in.(done,cancelled),end_date.lt.${today}`).neq('status', 'draft').order('start_date', { ascending: false }).limit(100)
  // 제목·행사명·장소로 찾기
  const term = typeof sp.q === 'string' ? sp.q.trim().slice(0, 50) : ''
  const all = must(await q) as JobWithAppStatus[]
  const jobs = term
    ? all.filter((j) => [j.title, j.event_name, j.location_name].some((v) => v?.toLowerCase().includes(term.toLowerCase())))
    : all
  const counts = countApps(jobs, 'approved')
  // 지난 공고: 근무는 끝났는데 아직 '지급 완료'로 처리하지 않은 근무자 수 (급여 지급을 빠뜨리지 않게)
  // 공고마다 지급총액(세전, 정산 탭과 같은 계산): 출퇴근 기록이 있는 공고만
  const [views, unpaid, wages, everCount] = await Promise.all([
    viewStats(jobs.map((j) => j.id)),
    tab === 'past' ? unpaidByJob(admin.companyId, today) : {},
    wageTotals(admin.companyId, jobs),
    // 공고를 한 번도 안 올린 새 회사인지 (빈 화면을 '첫 공고' 안내로 · 복사할 지난 공고가 없으니 '복사하기'는 숨김)
    tab === 'active' && all.length === 0
      ? db()
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', admin.companyId)
          .then((r) => r.count ?? 1)
      : 1,
  ])
  const firstTime = everCount === 0
  const grossOf = (id: string) => wages[id]?.gross ?? 0
  const waitingBy = countApps(jobs, 'applied')
  const unpaidOf = (id: string) => (unpaid as Record<string, { n: number }>)[id]?.n ?? 0

  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">공고 · 출퇴근</h1>
        <Link href="/admin/jobs/new" className="btn-primary">
          + 새 공고 등록
        </Link>
      </div>
      {/* 우리 회사 공고만 모은 링크: 근무자 단톡방에 한 번 올려 두면 새 공고도 그 링크에서 봄 */}
      {tab === 'active' && (
        // 두 줄로 짧게: 위 '공고 모음 링크 · QR · 공유하기' / 아래 한 줄 안내 (360px에서도 잘리지 않음)
        <div className="card space-y-1 px-4 py-3" data-share-card>
          <div className="flex items-center gap-2">
            <Icon name="megaphone" className="shrink-0 text-lg text-brand-600" />
            <span className="min-w-0 flex-1 truncate font-bold">공고 모음 링크</span>
            {/* 현장·게시판에 붙일 QR (찍으면 이 회사 공고 모음) */}
            <Link href="/admin/jobs/poster" className="chip shrink-0 whitespace-nowrap" data-poster-link>
              QR
            </Link>
            <ShareButton className="chip-primary shrink-0 whitespace-nowrap" title={`${admin.companyName} 모집 공고`} text={`${admin.companyName} 모집 공고 모음`} path={`/?co=${admin.companyId}`} />
          </div>
          <span className="block text-xs text-sub">{firstTime ? '첫 공고를 올린 뒤 단톡방에 올려 두세요' : '단톡방에 올려 두면 새 공고도 여기서 봐요'}</span>
        </div>
      )}
      <div className="flex gap-1 text-sm font-semibold">
        {(
          [
            ['active', '진행·예정'],
            ['draft', '임시저장'],
            ['past', '지난 공고'],
          ] as const
        ).map(([k, label]) => (
          <Link key={k} href={`/admin/jobs?tab=${k}`} className={`rounded-lg px-3 py-1.5 ${tab === k ? 'bg-white shadow-sm' : 'text-mute'}`}>
            {label}
          </Link>
        ))}
      </div>
      <form className="flex gap-1.5" role="search">
        <input type="hidden" name="tab" value={tab} />
        <SearchInput name="q" enterKeyHint="search" defaultValue={term} className="input min-w-0 flex-1 py-2 text-sm" placeholder="공고 제목·행사명·장소로 찾기" />
        <button className="btn-gray btn-sm shrink-0">찾기</button>
        {term && (
          <Link href={`/admin/jobs?tab=${tab}`} className="btn-gray btn-sm shrink-0">
            지우기
          </Link>
        )}
      </form>
      {term && (
        <p className="text-sm text-sub">
          ‘{term}’ 검색 결과 {jobs.length}건
        </p>
      )}
      {jobs.length === 0 ? (
        // 빈 화면: 탭·검색마다 다음에 할 일 (새 회사는 '새 공고 등록'부터)
        <div data-jobs-empty={term ? 'search' : tab}>
          {term ? (
            <Empty icon="🔍" title={`‘${term}’에 맞는 공고가 없어요`}>
              <p>제목·행사명·장소로 찾아요.</p>
              <Link href={`/admin/jobs?tab=${tab}`} className="btn-gray btn-sm mt-3 inline-flex">
                검색 지우기
              </Link>
            </Empty>
          ) : tab === 'active' && firstTime ? (
            // 처음 시작한 회사: 복사할 지난 공고가 없으니 첫 공고만 안내
            <Empty icon="📋" title="첫 공고를 올려 보세요">
              {/* 문장마다 한 줄 (좁은 화면에서 '서류 / 서식은'처럼 어색하게 끊기지 않게) */}
              <p data-first-job>
                <span className="block">시간·시급·장소만 넣으면 바로 모집을 시작해요.</span>
                <span className="block">서류 서식은 기본으로 준비돼 있어요.</span>
              </p>
              <div className="mt-4 flex justify-center">
                <Link href="/admin/jobs/new" className="btn-primary btn-sm" data-track="첫 공고 등록">
                  + 첫 공고 등록
                </Link>
              </div>
            </Empty>
          ) : tab === 'active' ? (
            <Empty icon="📋" title="진행 중인 공고가 없어요">
              <p>시간·시급·장소만 넣으면 바로 모집을 시작해요.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link href="/admin/jobs/new" className="btn-primary btn-sm">
                  + 새 공고 등록
                </Link>
                <Link href="/admin/jobs?tab=past" className="btn-gray btn-sm">
                  지난 공고 복사하기
                </Link>
              </div>
            </Empty>
          ) : tab === 'draft' ? (
            <Empty icon="📝" title="임시저장한 공고가 없어요">
              <p>공고 상태를 &lsquo;임시저장&rsquo;으로 두면 근무자에게 보이지 않고 여기에 모여요.</p>
            </Empty>
          ) : (
            <Empty icon="🗂️" title="지난 공고가 없어요">
              <p>끝난 행사의 공고가 여기에 남아요. 복사해서 다시 쓸 수 있어요.</p>
            </Empty>
          )}
        </div>
      ) : (
        <>
          {/* 휴대폰: 카드 (표는 칸이 좁아 옆으로 밀어야 해서) */}
          <div className="stagger space-y-2 sm:hidden">
            {jobs.map((j) => {
              const approved = counts[j.id] ?? 0
              return (
                <Link key={j.id} href={`/admin/jobs/${j.id}`} className="card-link block p-4">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`badge ${STATUS[j.status][1]}`}>{STATUS[j.status][0]}</span>
                    {waitingBy[j.id] > 0 && <span className="badge bg-amber-50 text-amber-700">대기 {waitingBy[j.id]}명</span>}
                    {unpaidOf(j.id) > 0 && <span className="badge bg-rose-50 text-rose-600">💰 미지급 {unpaidOf(j.id)}명</span>}
                    {j.event_name && <span className="text-xs font-semibold text-mute">{j.event_name}</span>}
                  </div>
                  <p className="font-bold">
                    {j.audience === 'expert' && <span className="badge mr-1 bg-violet-50 align-middle text-violet-700">🎛️ 전문가</span>}
                    {j.title}
                  </p>
                  <p className="mt-0.5 text-sm text-sub">
                    {fmtDateRange(j.start_date, j.end_date)} {scheduleText(j)}
                  </p>
                  {grossOf(j.id) > 0 && (
                    <p className="mt-0.5 text-sm text-sub tabular-nums" data-job-wage>
                      지급총액 <b className="text-ink">{won(grossOf(j.id))}</b>
                      <span className="text-xs text-mute"> (세전 · {wages[j.id].people}명)</span>
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs text-mute">
                    <SlotBar value={approved} max={j.headcount} height="h-1.5" className="min-w-0 flex-1" />
                    <span className="shrink-0 tabular-nums">
                      확정 <b className="text-ink">{approved}</b>/{j.headcount}명
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 tabular-nums" title="공고를 확인한 인원 (가입자 + 로그인 안 한 사람)" data-views>
                      <Icon name="eye" className="text-mute" /> {views[j.id]?.total ?? 0}
                      {(views[j.id]?.total ?? 0) > 0 && <span className="text-mute">(가입 {views[j.id]?.members ?? 0})</span>}
                      {(views[j.id]?.live ?? 0) > 0 && <b className="ml-1 text-emerald-600">● {views[j.id].live}</b>}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>

          <div className="card hidden overflow-x-auto p-0 sm:block">
            <table className="table">
              <thead>
                <tr>
                  <th>공고</th>
                  <th>일정</th>
                  <th>확정/모집</th>
                  <th>대기</th>
                  <th>확인</th>
                  <th className="text-right">지급총액</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <Link href={`/admin/jobs/${j.id}`} className="font-semibold hover:text-brand-600">
                        {j.audience === 'expert' && <span className="badge mr-1 bg-violet-50 text-violet-700">🎛️ 전문가</span>}
                        {j.title}
                      </Link>
                      {j.event_name && <div className="text-xs text-mute">{j.event_name}</div>}
                    </td>
                    <td className="whitespace-nowrap">
                      {fmtDateRange(j.start_date, j.end_date)}
                      <div className="text-xs text-mute">{scheduleText(j)}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <b>{counts[j.id] ?? 0}</b>/{j.headcount}
                    </td>
                    <td>{waitingBy[j.id] ? <span className="badge bg-amber-50 text-amber-700">{waitingBy[j.id]}명</span> : '-'}</td>
                    <td className="whitespace-nowrap tabular-nums" data-views-cell>
                      {views[j.id]?.total ?? 0}명{(views[j.id]?.live ?? 0) > 0 && <b className="ml-1 text-emerald-600">● {views[j.id].live}</b>}
                      {/* 확인 = 가입자 + 로그인 안 하고 본 사람 (카톡 링크로 보고 가입은 안 한 사람 등) */}
                      {(views[j.id]?.total ?? 0) > 0 && (
                        <div className="text-xs text-mute">
                          가입자 {views[j.id].members}
                          {views[j.id].total > views[j.id].members && ` · 비회원 ${views[j.id].total - views[j.id].members}`}
                        </div>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums" data-job-wage-cell>
                      {grossOf(j.id) > 0 ? (
                        <>
                          <b>{won(grossOf(j.id))}</b>
                          <div className="text-xs text-mute">세전 · {wages[j.id].people}명</div>
                        </>
                      ) : (
                        <span className="text-mute">-</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS[j.status][1]}`}>{STATUS[j.status][0]}</span>
                      {unpaidOf(j.id) > 0 && <span className="badge ml-1 bg-rose-50 text-rose-600">💰 미지급 {unpaidOf(j.id)}명</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
