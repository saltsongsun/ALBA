import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deleteRating } from '@/app/actions/admin'
import { RatingForm, ResetPin, RevealRrn, WorkerEditForm } from '@/components/admin'
import { ContactButtons } from '@/components/Contact'
import Fold, { ShowMore } from '@/components/Fold'
import PhotoUpload from '@/components/PhotoUpload'
import { StarAvg, StarRow } from '@/components/Stars'
import { ConfirmSubmit } from '@/components/ui'
import { decrypt } from '@/lib/crypto'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { calcDay, settle } from '@/lib/pay'
import { reliabilityFor } from '@/lib/reliability'
import { requireAdmin } from '@/lib/session'
import { ageOn, fmtDate, fmtDateLong, fmtDateRange, kstDate, kstDateTime } from '@/lib/time'
import type { Application, Attendance, Job, SignedDoc, UserRow, WorkerRating } from '@/lib/types'
import { isUuid } from '@/lib/validate'
import { careerText } from '@/lib/careers'

export const metadata: Metadata = { title: '근무자 정보' }

export default async function WorkerPage(props: PageProps<'/admin/workers/[id]'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  if (!isUuid(id)) notFound()
  const [{ data }, apps, atts, docs, ratings, relMap] = await Promise.all([
    db().from('users').select('*').eq('id', id).maybeSingle(),
    db()
      .from('applications')
      .select('*, job:jobs(*)')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .then((r) => must(r) as (Application & { job: Job })[]),
    db().from('attendance').select('*').eq('user_id', id).then((r) => must(r) as Attendance[]),
    db()
      .from('signed_docs')
      .select('id, job_id, title, status, signed_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .then((r) => must(r) as Pick<SignedDoc, 'id' | 'job_id' | 'title' | 'status' | 'signed_at'>[]),
    db()
      .from('worker_ratings')
      .select('id, job_id, rater_id, score, comment, updated_at, job:jobs(title), rater:users!worker_ratings_rater_id_fkey(name)')
      .eq('user_id', id)
      .order('updated_at', { ascending: false })
      .then(
        (r) =>
          must(r) as unknown as (Pick<WorkerRating, 'id' | 'job_id' | 'rater_id' | 'score' | 'comment' | 'updated_at'> & {
            job: { title: string } | null
            rater: { name: string } | null
          })[],
      ),
    reliabilityFor([id]),
  ])
  const u = data as UserRow | null
  if (!u) notFound()
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

  return (
    <div className="space-y-5">
      <Link href="/admin/workers" className="text-sm font-semibold text-sub">
        ← 근무자 목록
      </Link>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3">
          <PhotoUpload userId={u.id} name={u.name} photoAt={u.photo_at} admin>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-2xl font-extrabold">{u.name}</h1>
              {age != null && <span className="text-sub">만 {age}세 {u.gender === 'M' ? '남' : u.gender === 'F' ? '여' : ''}</span>}
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
            {!!u.careers?.length && (
              <ul className="mt-2 space-y-0.5 text-sm">
                {u.careers.map((c, i) => (
                  <li key={i} className="text-sub">
                    🎪 {careerText(c)}
                  </li>
                ))}
              </ul>
            )}
          </PhotoUpload>
          <dl className="grid grid-cols-[96px_1fr] gap-y-2 text-sm">
            <dt className="text-mute">휴대폰</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              <ContactButtons phone={u.phone} name={u.name} />
              <Link href={`/admin/chat/${u.id}`} className="contact-btn bg-bg text-sub hover:bg-line">
                앱 메시지
              </Link>
            </dd>
            <dt className="text-mute">주민등록번호</dt>
            <dd>
              <RevealRrn userId={u.id} masked={u.rrn_masked} />
            </dd>
            <dt className="text-mute">생년월일</dt>
            <dd>{u.birth_date ? fmtDateLong(u.birth_date) : '-'}</dd>
            <dt className="text-mute">주소</dt>
            <dd>{u.address ?? '-'}</dd>
            <dt className="text-mute">계좌</dt>
            <dd>
              {account ? `${u.bank_name ?? ''} ${account} (예금주 ${u.account_holder ?? u.name})` : <span className="text-rose-500">미등록</span>}
              {recentBankChange && <span className="badge ml-1 bg-amber-50 text-amber-700">최근 변경 {fmtDate(kstDate(u.bank_changed_at!))}</span>}
            </dd>
            <dt className="text-mute">비상연락처</dt>
            <dd>{u.emergency_phone ? <ContactButtons phone={u.emergency_phone} name={`${u.name} 비상연락처`} /> : '-'}</dd>
            <dt className="text-mute">가입</dt>
            <dd>
              {kstDateTime(u.created_at)} · 개인정보 동의 {u.privacy_agreed_at ? kstDateTime(u.privacy_agreed_at) : '-'}
            </dd>
          </dl>
          <div className="border-t border-line pt-3">
            <ResetPin userId={u.id} />
          </div>
        </section>
        <div className="self-start">
          <Fold
            title="정보 수정"
            summary={[u.role === 'admin' ? '관리자' : '근무자', u.active ? '사용 중' : '정지', u.admin_memo && `메모: ${u.admin_memo}`].filter(Boolean).join(' · ')}
          >
            <WorkerEditForm
              userId={u.id}
              initial={{ name: u.name, phone: u.phone, role: u.role, active: u.active, admin_memo: u.admin_memo ?? '' }}
            />
          </Fold>
        </div>
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
        <RatingForm userId={u.id} jobs={[...jobs.values()].filter(Boolean).map((j) => ({ id: j.id, title: j.title }))} />
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
                    <td>
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
            <Link key={a.id} href={`/admin/jobs/${a.job_id}?tab=apps`} className="flex justify-between py-2.5 text-sm">
              <span>{a.job?.title}</span>
              <span className="text-mute">{a.status === 'approved' ? '확정' : a.status === 'applied' ? '대기' : a.status === 'rejected' ? '미선발' : '취소'}</span>
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
            <Link key={d.id} href={`/docs/${d.id}`} className="flex justify-between py-2.5 text-sm">
              <span>
                {d.title} <span className="text-mute">{jobs.get(d.job_id)?.title}</span>
              </span>
              <span className={d.status === 'signed' ? 'text-emerald-600' : d.status === 'void' ? 'text-mute line-through' : 'text-amber-600'}>
                {d.status === 'signed' ? `서명 ${fmtDate(kstDate(d.signed_at!))}` : d.status === 'void' ? '무효' : '대기'}
              </span>
            </Link>
          ))}
        </Fold>
      </div>
    </div>
  )
}
