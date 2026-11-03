import RosterLock, { RosterOpenBar, RosterTooMany } from '@/components/RosterLock'
import { ROSTER_MINUTES, rosterUnlockedFor, rosterViewAllowed } from '@/lib/rosterLock'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { assignWorkerToJob, deleteRating } from '@/app/actions/admin'
import { RatingForm, ResetPin, RevealRrn, WorkerEditForm } from '@/components/admin'
import { ContactButtons } from '@/components/Contact'
import Fold, { ShowMore } from '@/components/Fold'
import PhotoUpload from '@/components/PhotoUpload'
import Avatar from '@/components/Avatar'
import { StarAvg, StarRow } from '@/components/Stars'
import { ConfirmSubmit } from '@/components/ui'
import Flash from '@/components/Flash'
import { decrypt } from '@/lib/crypto'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { calcDay, settle } from '@/lib/pay'
import { reliabilityFor } from '@/lib/reliability'
import { requireAdmin } from '@/lib/session'
import { workerInCompany } from '@/lib/company'
import { MEMBER_TYPES } from '@/lib/members'
import { ageOn, fmtDate, fmtDateLong, fmtDateRange, kstDate, kstDateTime } from '@/lib/time'
import type { Application, Attendance, Job, SignedDoc, UserRow, WorkerRating } from '@/lib/types'
import { isUuid } from '@/lib/validate'
import { careerText } from '@/lib/careers'

export const metadata: Metadata = { title: '근무자 정보' }

/** 근무자 머리: 사진(바꾸기)·이름. 지원 전 회원이면 사진은 보기만 */
function Head({ userId, name, photoAt, editable, children }: { userId: string; name: string; photoAt: string | null; editable: boolean; children: React.ReactNode }) {
  if (editable) {
    return (
      <PhotoUpload userId={userId} name={name} photoAt={photoAt} admin>
        {children}
      </PhotoUpload>
    )
  }
  return (
    <div className="flex items-start gap-4">
      <Avatar id={userId} name={name} photoAt={photoAt} size="xl" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export default async function WorkerPage(props: PageProps<'/admin/workers/[id]'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  if (!isUuid(id)) notFound()
  // 보안: 명단은 관리자 본인 비밀번호를 한 번 더 넣어야 열림 (10분)
  const rosterLeft = await rosterUnlockedFor(admin.id)
  if (!rosterLeft) return <RosterLock next={`/admin/workers/${id}`} minutes={ROSTER_MINUTES} />
  if (!(await rosterViewAllowed(admin, 'detail'))) return <RosterTooMany />
  // 가입 회원은 모든 회사 공용이라 누구나 볼 수 있지만, 주민번호·계좌·주소·비상연락처·수정은 이 회사에 지원한 사람만
  const related = await workerInCompany(admin.companyId, id)
  const sp = await props.searchParams
  const today = kstDate()
  const [{ data }, apps, atts, docs, ratings, relMap, openJobs, { data: note }, { data: member }] = await Promise.all([
    db().from('users').select('*').eq('id', id).maybeSingle(),
    db()
      .from('applications')
      .select('*, job:jobs(*)').eq('company_id', admin.companyId)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .then((r) => must(r) as (Application & { job: Job })[]),
    db().from('attendance').select('*').eq('company_id', admin.companyId).eq('user_id', id).then((r) => must(r) as Attendance[]),
    db()
      .from('signed_docs')
      .select('id, job_id, title, status, signed_at').eq('company_id', admin.companyId)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .then((r) => must(r) as Pick<SignedDoc, 'id' | 'job_id' | 'title' | 'status' | 'signed_at'>[]),
    db()
      .from('worker_ratings')
      .select('id, job_id, rater_id, score, comment, updated_at, job:jobs(title), rater:users!worker_ratings_rater_id_fkey(name)').eq('company_id', admin.companyId)
      .eq('user_id', id)
      .order('updated_at', { ascending: false })
      .then(
        (r) =>
          must(r) as unknown as (Pick<WorkerRating, 'id' | 'job_id' | 'rater_id' | 'score' | 'comment' | 'updated_at'> & {
            job: { title: string } | null
            rater: { name: string } | null
          })[],
      ),
    reliabilityFor(admin.companyId, [id]),
    // 바로 확정할 수 있는 공고 (모집 중·마감, 아직 끝나지 않음)
    db()
      .from('jobs')
      .select('id, title, start_date, end_date, status').eq('company_id', admin.companyId)
      .in('status', ['open', 'closed'])
      .gte('end_date', today)
      .order('start_date')
      .then((r) =>
        (must(r) as Pick<Job, 'id' | 'title' | 'start_date' | 'end_date' | 'status'>[]).filter(
          (j) => ['open', 'closed'].includes(j.status) && j.end_date >= today,
        ),
      ),
    // 이 회사에만 보이는 메모 · 이 회사 관리자인지
    db().from('company_worker_notes').select('memo').eq('company_id', admin.companyId).eq('user_id', id).maybeSingle(),
    db().from('company_members').select('role').eq('company_id', admin.companyId).eq('user_id', id).maybeSingle(),
  ])
  const found = data as UserRow | null
  // 다른 회사 관리자·외주 업체 계정은 근무자 화면으로 열지 않음
  // 직접 가입해 확인 전인 회사는 우리 회사에 지원한 회원만 볼 수 있음
  // 우리 회사와 관계없는 회원: 탈퇴·정지 계정, 관리자·외주 업체 계정, 확인 전 회사는 못 봄
  if (!found || (!related && (found.role === 'admin' || found.member_type === 'vendor' || !admin.companyVerified || !found.active))) notFound()
  // 메모·관리자 표시는 이 회사 기준 (다른 회사 메모·소속은 보이지 않게)
  const u: UserRow = { ...found, admin_memo: (note as { memo: string | null } | null)?.memo ?? null, role: member ? 'admin' : 'worker' }
  const rel = relMap[id]
  const account = decrypt(u.bank_account_enc)
  const age = u.birth_date ? ageOn(u.birth_date, kstDate()) : null
  const jobs = new Map(apps.map((a) => [a.job_id, a.job]))
  const perJob = [...new Set(atts.map((a) => a.job_id))]
    .map((jid) => {
      const job = jobs.get(jid)
      if (!job) return null
      const rows = atts.filter((a) => a.job_id === jid)
      return { job, s: settle(job, rows.map((r) => calcDay(job, r))) }
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.job.start_date.localeCompare(a.job.start_date))
  const recentBankChange = u.bank_changed_at && Date.now() - new Date(u.bank_changed_at).getTime() < 14 * 86_400_000

  const assignable = openJobs.filter((j) => !apps.some((a) => a.job_id === j.id && a.status === 'approved'))
  return (
    <div className="space-y-5">
      <Flash m={sp.m} />
      <RosterOpenBar seconds={rosterLeft} />
      <Link href="/admin/workers" className="text-sm font-semibold text-sub">
        ← 근무자 목록
      </Link>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3">
          {/* 우리 회사에 지원한 사람만 관리자가 사진을 바꿀 수 있음 (지원 전 회원은 보기만) */}
          <Head userId={u.id} name={u.name} photoAt={u.photo_at} editable={related}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-2xl font-extrabold">{u.name}</h1>
              {age != null && <span className="text-sub">만 {age}세 {u.gender === 'M' ? '남' : u.gender === 'F' ? '여' : ''}</span>}
              {u.member_type && u.member_type !== 'worker' && (
                <span className={`badge ${MEMBER_TYPES[u.member_type].badge}`}>
                  {MEMBER_TYPES[u.member_type].emoji} {MEMBER_TYPES[u.member_type].label}
                </span>
              )}
              {u.is_foreigner && <span className="badge bg-brand-50 text-brand-700">외국인</span>}
              {age != null && age < 18 && <span className="badge bg-rose-50 text-rose-600">연소자 (친권자 동의 필요)</span>}
              {!u.active && <span className="badge bg-gray-100 text-mute">정지</span>}
            </div>
            {/* 지난 근무 성실도 (출퇴근 기록 기준) */}
            <p className="mt-1 text-sm text-sub">
              근무 {rel.days}일 · 지각 {rel.late}회 ·{' '}
              <span className={rel.noShow ? 'font-bold text-rose-600' : ''}>노쇼 {rel.noShow}회</span>
              {rel.dismissed > 0 && <b className="text-rose-600"> · 귀가 조치 {rel.dismissed}회</b>}
            </p>
            {/* 전문가: 분야·소개·포트폴리오 */}
            {(u.specialty || u.intro || u.portfolio_url) && (
              <div className="mt-2 space-y-0.5 text-sm">
                {u.specialty && <p className="font-semibold text-violet-700">🎛️ {u.specialty.split(',').join(' · ')}</p>}
                {u.intro && <p className="text-sub">{u.intro}</p>}
                {u.portfolio_url && (
                  <a href={u.portfolio_url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-brand-600 underline">
                    포트폴리오 보기 ↗
                  </a>
                )}
              </div>
            )}
            {!!u.careers?.length && (
              <ul className="mt-2 space-y-0.5 text-sm">
                {u.careers.map((c, i) => (
                  <li key={i} className="text-sub">
                    🎪 {careerText(c)}
                  </li>
                ))}
              </ul>
            )}
          </Head>
          <dl className="grid grid-cols-[96px_1fr] gap-y-2 text-sm">
            <dt className="text-mute">휴대폰</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              <ContactButtons phone={u.phone} name={u.name} />
              <Link href={`/admin/chat/${u.id}`} className="contact-btn bg-bg text-sub hover:bg-line">
                앱 메시지
              </Link>
            </dd>
            <dt className="text-mute">생년월일</dt>
            <dd>{u.birth_date ? fmtDateLong(u.birth_date) : '-'}</dd>
            {related && (
              <>
            <dt className="text-mute">주민등록번호</dt>
            <dd>
              <RevealRrn userId={u.id} masked={u.rrn_masked} />
            </dd>
            <dt className="text-mute">주소</dt>
            <dd>{u.address ?? '-'}</dd>
            <dt className="text-mute">계좌</dt>
            <dd>
              {account ? `${u.bank_name ?? ''} ${account} (예금주 ${u.account_holder ?? u.name})` : <span className="text-rose-500">미등록</span>}
              {recentBankChange && <span className="badge ml-1 bg-amber-50 text-amber-700">최근 변경 {fmtDate(kstDate(u.bank_changed_at!))}</span>}
              {account && u.account_holder && u.account_holder.replace(/\s/g, '') !== u.name.replace(/\s/g, '') && (
                <span className="badge ml-1 bg-rose-50 text-rose-600">예금주 다름</span>
              )}
            </dd>
            <dt className="text-mute">비상연락처</dt>
            <dd>{u.emergency_phone ? <ContactButtons phone={u.emergency_phone} name={`${u.name} 비상연락처`} /> : '-'}</dd>
              </>
            )}
            <dt className="text-mute">가입</dt>
            <dd>
              {kstDateTime(u.created_at)} · 개인정보 동의 {u.privacy_agreed_at ? kstDateTime(u.privacy_agreed_at) : '-'}
            </dd>
          </dl>
          {/* 모집 중인 공고에 바로 확정 (예전에 잘한 사람 다시 부르기) */}
          {u.active && assignable.length > 0 && (
            <form action={assignWorkerToJob.bind(null, u.id)} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <select name="job_id" className="input min-w-0 flex-1 py-2 text-sm" required defaultValue="">
                <option value="" disabled>
                  공고 골라 바로 확정
                </option>
                {assignable.map((j) => (
                  <option key={j.id} value={j.id}>
                    {fmtDateRange(j.start_date, j.end_date)} · {j.title}
                  </option>
                ))}
              </select>
              <ConfirmSubmit className="btn-primary btn-sm" confirmText="한 번 더 누르면 확정돼요">
                확정으로 추가
              </ConfirmSubmit>
            </form>
          )}
          {related ? (
            // 비밀번호 초기화: 근무자 계정만 (관리자 계정은 최고 관리자만)
            (u.role === 'worker' || admin.isSuper) && u.id !== admin.id && (
              <div className="border-t border-line pt-3">
                <ResetPin userId={u.id} />
              </div>
            )
          ) : (
            <p className="rounded-xl bg-bg px-3.5 py-2.5 text-sm text-sub">
              아직 우리 회사에 지원한 적 없는 회원이에요. 공고에 확정하거나 이 사람이 지원하면 주민번호·계좌·주소를 볼 수 있어요.
            </p>
          )}
        </section>
        {related && (
        <div className="self-start">
          <Fold
            title="정보 수정"
            summary={[u.role === 'admin' ? '관리자' : '근무자', u.active ? '사용 중' : '정지', u.admin_memo && `메모: ${u.admin_memo}`].filter(Boolean).join(' · ')}
          >
            <WorkerEditForm
              userId={u.id}
              initial={{ name: u.name, phone: u.phone, role: u.role, active: u.active, admin_memo: u.admin_memo ?? '' }}
              canSuspend={admin.isSuper}
              canEditIdentity={admin.isSuper}
              canGrant={admin.isSuper || (admin.companyVerified && admin.companies.find((c) => c.id === admin.companyId)?.role === 'owner')}
            />
          </Fold>
        </div>
        )}
      </div>

      <Fold
        title="관리자 평가"
        badge={<StarAvg scores={ratings.map((r) => r.score)} />}
        summary={ratings.length ? `${ratings.length}건 · 최근: ${ratings[0].comment || `${ratings[0].score}점`}` : '아직 평가가 없어요 · 근무자에게는 보이지 않아요'}
      >
        <p className="text-xs text-mute">근무자에게는 보이지 않아요.</p>
        {ratings.length > 0 && (
          <ShowMore
            limit={3}
            className="divide-y divide-line"
            items={ratings.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p>
                    <StarRow score={r.score} /> <span className="ml-1 font-semibold">{r.job?.title ?? '일반 메모'}</span>
                  </p>
                  {r.comment && <p className="mt-0.5 whitespace-pre-wrap text-sub">{r.comment}</p>}
                  <p className="mt-0.5 text-xs text-mute">
                    {r.rater?.name ?? '관리자'} · {fmtDate(kstDate(r.updated_at))}
                  </p>
                </div>
                {r.rater_id === admin.id && (
                  <form action={deleteRating.bind(null, r.id, u.id)}>
                    <ConfirmSubmit className="text-xs font-semibold text-mute underline" confirmText="지울까요?">
                      지우기
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
            ))}
          />
        )}
        {related && <RatingForm userId={u.id} jobs={[...jobs.values()].filter(Boolean).map((j) => ({ id: j.id, title: j.title }))} />}
        <p className="hint">개인정보 열람 요청이 오면 보여 줘야 할 수 있으니 사실 위주로 적어 주세요.</p>
      </Fold>

      <Fold
        title="근무 이력"
        open={perJob.length > 0 && perJob.length <= 5}
        summary={perJob.length ? `행사 ${perJob.length}개 · ${perJob.reduce((n, p) => n + p.s.days, 0)}일 · 실지급 ${won(perJob.reduce((n, p) => n + p.s.net, 0))}` : '근무 기록이 없습니다'}
      >
        {perJob.length === 0 ? (
          <p className="text-center text-sm text-mute">근무 기록이 없습니다.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>공고</th>
                  <th>일정</th>
                  <th>일수</th>
                  <th className="text-right">지급총액</th>
                  <th className="text-right">실지급액</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {perJob.map(({ job, s }) => (
                  <tr key={job.id}>
                    <td className="min-w-48">
                      <Link href={`/admin/jobs/${job.id}?tab=pay`} className="font-semibold">
                        {job.title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{fmtDateRange(job.start_date, job.end_date)}</td>
                    <td>{s.days}</td>
                    <td className="text-right">{won(s.gross)}</td>
                    <td className="text-right font-semibold">{won(s.net)}</td>
                    <td className="whitespace-nowrap">
                      <Link href={`/print/payslip/${job.id}/${u.id}`} className="text-xs font-semibold text-brand-600">
                        명세서
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Fold>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Fold
          title="지원 내역"
          className="divide-y divide-line"
          summary={apps.length ? `${apps.length}건 · 확정 ${apps.filter((a) => a.status === 'approved').length}건` : '없음'}
        >
          {apps.length === 0 && <p className="py-3 text-sm text-mute">없음</p>}
          {apps.map((a) => (
            <Link key={a.id} href={`/admin/jobs/${a.job_id}?tab=apps`} className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">{a.job?.title}</span>
              <span className="shrink-0 whitespace-nowrap text-mute">{a.status === 'approved' ? '확정' : a.status === 'applied' ? '대기' : a.status === 'rejected' ? '미선발' : '취소'}</span>
            </Link>
          ))}
        </Fold>
        <Fold
          title="서류"
          className="divide-y divide-line"
          summary={docs.length ? `서명 ${docs.filter((d) => d.status === 'signed').length}건 · 대기 ${docs.filter((d) => d.status === 'pending').length}건` : '없음'}
        >
          {docs.length === 0 && <p className="py-3 text-sm text-mute">없음</p>}
          {docs.map((d) => (
            <Link key={d.id} href={`/docs/${d.id}`} className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block">{d.title}</span>
                <span className="block truncate text-xs text-mute">{jobs.get(d.job_id)?.title}</span>
              </span>
              <span className={`shrink-0 whitespace-nowrap ${d.status === 'signed' ? 'text-emerald-600' : d.status === 'void' ? 'text-mute line-through' : 'text-amber-600'}`}>
                {d.status === 'signed' ? `서명 ${fmtDate(kstDate(d.signed_at!))}` : d.status === 'void' ? '무효' : '대기'}
              </span>
            </Link>
          ))}
        </Fold>
      </div>
    </div>
  )
}
