import Link from 'next/link'
import { addWorkerToJob, approveAllApplied, decideApplication, decideSelected, holdApplication, rejectWaiting } from '@/app/actions/admin'
import { BULK_FORM, BulkApproveBar, PickAll } from '@/components/BulkApprove'
import { PositionInput } from '@/components/admin'
import Avatar from '@/components/Avatar'
import { ContactButtons } from '@/components/Contact'
import { GroupContact } from '@/components/GroupContact'
import InvitePast, { type PastWorker } from '@/components/InvitePast'
import { APP_STATUS } from '@/components/JobCard'

/** 관리자 화면 배지: 근무자 화면 말('지원완료')이 아니라 관리자가 할 일 기준 ('대기' 목록과 같은 말) */
const adminLabel = (status: keyof typeof APP_STATUS) => (status === 'applied' ? '확정 대기' : APP_STATUS[status].label)
import { scoresByUser, StarAvg } from '@/components/Stars'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { db, must } from '@/lib/db'
import { overlapDay } from '@/lib/overlap'
import { reliabilityFor, type Reliability } from '@/lib/reliability'
import { estimateDay } from '@/lib/pay'
import { staffByDay, fullDays } from '@/lib/staffing'
import { ageOn, dateList, fmtDate, kstDate, kstDateTime } from '@/lib/time'
import type { Job } from '@/lib/types'
import type { AppRow } from './page'
import { MEMBER_TYPES } from '@/lib/members'
import { careerText } from '@/lib/careers'
import { won } from '@/lib/format'
import { hoursText, weeklyImpact, type WeekImpact } from '@/lib/weekly'

/** 지원 상태 바꾸기 버튼 (휴대폰 카드는 넓게, 표는 작게) */
/** full: 모집 인원이 다 찼으면 확정할 때 한 번 더 물어봄 (초과 확정 실수 막기) */
function Decide({ a, wide = false, full = false, fullText = '인원 다 찼어요 · 확정?' }: { a: AppRow; wide?: boolean; full?: boolean; fullText?: string }) {
  const btn = (primary: boolean) => `${primary ? 'btn-primary' : 'btn-gray'} ${wide ? 'w-full' : 'btn-sm'}`
  // 휴대폰 카드: 확인 문구가 뜬 버튼이 넓어져서(짧게 늘어나는 움직임) 문구가 두 줄로 꺾이지 않게
  const form = wide ? 'flex-1 transition-[flex-grow] duration-200 has-[[data-confirm=armed]]:grow-[3]' : ''
  return (
    <div className={`flex ${wide ? 'gap-2' : 'gap-1'}`}>
      {a.status !== 'approved' && a.status !== 'cancelled' && (
        <form action={decideApplication.bind(null, a.id, 'approved')} className={form}>
          {full ? (
            <ConfirmSubmit className={btn(true)} confirmText={fullText}>
              확정
            </ConfirmSubmit>
          ) : (
            <SubmitButton className={btn(true)} pendingText="…">
              확정
            </SubmitButton>
          )}
        </form>
      )}
      {/* 보류: 근무자에게 알림 없이 따로 둠 (상태는 그대로 대기) */}
      {a.status === 'applied' && (
        <form action={holdApplication.bind(null, a.id, !a.held_at)} className={form}>
          <SubmitButton className={btn(false)} pendingText="…" track={a.held_at ? '보류 풀기' : '보류'}>
            {a.held_at ? '보류 풀기' : '보류'}
          </SubmitButton>
        </form>
      )}
      {a.status === 'applied' && (
        <form action={decideApplication.bind(null, a.id, 'rejected')} className={form}>
          {/* 미선발로 정하면 근무자에게 결과 알림이 가므로 한 번 더 확인 */}
          <ConfirmSubmit className={btn(false)} confirmText="미선발 알림 보낼까요?">
            미선발
          </ConfirmSubmit>
        </form>
      )}
      {(a.status === 'approved' || a.status === 'rejected') && (
        <form action={decideApplication.bind(null, a.id, 'applied')} className={form}>
          {a.status === 'approved' ? (
            // 확정을 되돌리면 서명한 서류도 무효가 되고 근무자에게 알림이 가므로 한 번 더 확인
            <ConfirmSubmit className={btn(false)} confirmText="서명 취소·알림 가요 · 대기로?">
              대기로
            </ConfirmSubmit>
          ) : (
            <SubmitButton className={btn(false)} pendingText="…">
              대기로
            </SubmitButton>
          )}
        </form>
      )}
    </div>
  )
}

/** 예전에 다른 행사에서 일한 근무자 (이 공고에 아직 지원하지 않은 사람, 최근 근무 순 200명까지) */
async function pastWorkers(job: Job, apps: AppRow[]): Promise<PastWorker[]> {
  const rows = must(
    await db().from('attendance').select('user_id').eq('company_id', job.company_id).neq('job_id', job.id).order('work_date', { ascending: false }).limit(3000),
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
    reliabilityFor(job.company_id, ids),
    db()
      .from('worker_ratings')
      .select('user_id, score').eq('company_id', job.company_id)
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
    .sort((a, b) => a.noShow + a.dismissed - (b.noShow + b.dismissed) || (b.avg ?? 0) - (a.avg ?? 0) || b.days - a.days)
}

export default async function AppsTab({
  job,
  apps,
  origin,
  sort = 'time',
  day = null,
  canAddDirect = true,
}: {
  job: Job
  apps: AppRow[]
  origin: string
  /** 번호로 직접 추가 (직접 가입해 확인 전인 회사는 못 함) */
  canAddDirect?: boolean
  sort?: string
  /** 여러 날 행사: 이날 근무 가능한 사람만 보기 */
  day?: string | null
}) {
  const ids = apps.map((a) => a.user_id)
  // 모집 중인 공고면 예전 근무자에게 모집을 알릴 수 있게
  const past = job.status === 'open' && job.end_date >= kstDate() ? await pastWorkers(job, apps) : []
  // 다른 행사에서의 근무·지각·노쇼, 관리자 평가 평균 (근무자에게는 보이지 않음)
  const [rel, ratings, others, notes] = ids.length
    ? await Promise.all([
        reliabilityFor(job.company_id, ids, job.id),
        db()
          .from('worker_ratings')
          .select('user_id, score').eq('company_id', job.company_id)
          .in('user_id', ids)
          .then((r) => must(r) as { user_id: string; score: number }[]),
        // 같은 사람이 다른 행사에 확정된 근무 (같은 시간에 겹치면 표시)
        db()
          .from('applications')
          .select('user_id, available_dates, job:jobs(id, title, start_date, end_date, start_time, end_time, status)').eq('company_id', job.company_id)
          .in('user_id', ids)
          .eq('status', 'approved')
          .neq('job_id', job.id)
          .then(
            (r) =>
              must(r) as unknown as {
                user_id: string
                available_dates: string[] | null
                job: Pick<Job, 'id' | 'title' | 'start_date' | 'end_date' | 'start_time' | 'end_time' | 'status'> | null
              }[],
          ),
        // 시나리오: 지난번에 문제가 있던 사람이 또 지원 → 우리 회사 메모를 지원 카드에 (근무자에게는 안 보임)
        db()
          .from('company_worker_notes')
          .select('user_id, memo')
          .eq('company_id', job.company_id)
          .in('user_id', ids)
          .then(
            (r) => new Map(((r.data ?? []) as { user_id: string; memo: string | null }[]).filter((n) => n.memo?.trim()).map((n) => [n.user_id, n.memo!.trim()])),
            () => new Map<string, string>(),
          ),
      ])
    : [{} as Record<string, Reliability>, [], [], new Map<string, string>()]
  // 추가 근로 → 주휴수당 (관리자에게만): 이 공고를 확정하면 같은 회사 다른 공고와 합쳐 한 주 15시간을 넘는 사람
  const impact = await weeklyImpact(job, apps).catch(() => new Map<string, WeekImpact>())
  const today = kstDate()
  const clashOf = new Map<string, { id: string; title: string; at: string }>()
  for (const a of apps) {
    if (a.status !== 'applied' && a.status !== 'approved') continue
    for (const o of others) {
      if (o.user_id !== a.user_id || !o.job || o.job.end_date < today || o.job.status === 'cancelled') continue
      const at = overlapDay({ ...job, dates: a.available_dates }, { ...o.job, dates: o.available_dates })
      if (at) {
        clashOf.set(a.user_id, { id: o.job.id, title: o.job.title, at })
        break
      }
    }
  }
  const Memo = ({ uid }: { uid: string }) => {
    const m = notes.get(uid)
    if (!m) return null
    return (
      <Link href={`/admin/workers/${uid}`} className="mt-1 block truncate rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200" data-worker-memo>
        📝 우리 메모 · {m}
      </Link>
    )
  }
  const Clash = ({ uid }: { uid: string }) => {
    const c = clashOf.get(uid)
    if (!c) return null
    return (
      <Link href={`/admin/jobs/${c.id}`} className="mt-1 inline-block rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
        ⚠️ {fmtDate(kstDate(c.at))} 다른 근무와 겹침 · {c.title}
      </Link>
    )
  }
  const becomes = (a: AppRow) => a.status === 'applied' && impact.get(a.user_id)?.kind === 'becomes'
  // 짧게 한 줄: '확정하면 주휴 대상 · 약 33,024원' (누르면 주간 화면에서 자세히)
  const Weekly = ({ a }: { a: AppRow }) => {
    const w = impact.get(a.user_id)
    if (!w || (a.status !== 'applied' && a.status !== 'approved')) return null
    const text = a.status === 'approved' ? `주휴 대상 · 약 ${won(w.amount)}` : w.kind === 'becomes' ? `확정하면 주휴 대상 · 약 ${won(w.amount)}` : '이미 주휴 대상 주'
    return (
      <Link
        href={`/admin/weekly?w=${w.weekStart}`}
        title={`${fmtDate(w.weekStart)} 주 ${hoursText(w.before)} → ${hoursText(w.after)}`}
        className={`mt-1 inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ${becomes(a) ? 'bg-emerald-50 text-emerald-800' : 'bg-bg text-sub'}`}
        data-weekly-impact={a.status === 'approved' ? 'approved' : w.kind}
      >
        {text}
      </Link>
    )
  }
  const scores = scoresByUser(ratings)
  const relText = (uid: string) => {
    const r = rel[uid]
    if (!r || (r.days === 0 && r.noShow === 0)) return '첫 근무'
    return (
      <>
        근무 {r.days}일{r.late > 0 && ` · 지각 ${r.late}`}
        {r.noShow > 0 && <b className="text-rose-600"> · 노쇼 {r.noShow}</b>}
        {r.dismissed > 0 && <b className="text-rose-600"> · 귀가 조치 {r.dismissed}</b>}
      </>
    )
  }
  // 보류한 지원자는 '대기'에서 빼고 따로 (확정·미선발을 나중에 정함)
  const isHeld = (a: AppRow) => a.status === 'applied' && !!a.held_at
  const waiting = apps.filter((a) => a.status === 'applied' && !a.held_at).length
  const heldN = apps.filter(isHeld).length
  const approved = apps.filter((a) => a.status === 'approved')
  // 날짜별 확정 인원 (여러 날 행사는 사람마다 가능한 날이 달라서 날마다 셈)
  const dates = dateList(job.start_date, job.end_date)
  const multi = dates.length > 1
  const byDay = staffByDay(dates, approved)
  const waitByDay = staffByDay(dates, apps.filter((a) => a.status === 'applied'))
  // 만 18세 미만: 야간(22~06시)·하루 7시간 넘는 근무는 제한 (근로기준법 제69·70조) → 이 공고가 해당하면 확정할 때 한 번 더
  const est = estimateDay(job)
  const minorLimits = [est.nightMin > 0 && '야간', est.paidMin > 420 && '7시간 초과'].filter((x): x is string => !!x)
  const isMinor = (a: AppRow) => !!a.user.birth_date && ageOn(a.user.birth_date, job.start_date) < 18
  const minorWarn = (a: AppRow) => (isMinor(a) && minorLimits.length ? `${minorLimits.join('·')} 근무 제한` : null)
  const fullOf = (a: AppRow) => {
    const over = fullDays(a, dates, byDay, job.headcount)
    const warn = minorWarn(a)
    // 확정하면 주휴수당이 생기는 사람도 한 번 더 (관리자에게만 보임)
    const weekly = becomes(a)
    // 같은 날 이미 확정된 다른 근무가 있으면 한 번 더 (한 사람을 두 현장에 보내지 않게)
    const clash = a.status === 'applied' && clashOf.has(a.user_id)
    return {
      full: over.length > 0 || !!warn || weekly || clash,
      text: warn
        ? `연소자 ${minorLimits.join('·')} · 확정?`
        : clash
          ? '겹쳐요 · 확정?'
          : weekly && over.length === 0
          ? '주휴 대상이 돼요 · 확정?'
          : !multi
          ? '인원 다 찼어요 · 확정?'
          : over.length === dates.length || over.length > 2
            ? '모든 날 인원 다 참 · 확정?'
            : `${over.map(fmtDate).join('·')} 다 참 · 확정?`,
    }
  }
  const minorsWaiting = minorLimits.length ? apps.filter((a) => a.status === 'applied' && isMinor(a)).length : 0
  // 확정하면 주휴수당이 생기는 대기 지원자 (관리자에게만 · 모두 확정 전에 한 번 더)
  const weeklyWaiting = apps.filter((a) => becomes(a) && !a.held_at).length
  const allOver = dates.some((d) => byDay[d] + waitByDay[d] > job.headcount) || minorsWaiting > 0 || weeklyWaiting > 0
  // 모집이 끝났는데(마감·종료·지난 행사·남은 날 인원 다 참) 대기자가 남아 있으면: 미선발로 정리하고 결과 알리기
  const recruitDone =
    job.status !== 'open' || job.end_date < today || dates.filter((d) => d >= today).every((d) => byDay[d] >= job.headcount)
  const canRejectWaiting = waiting > 0 && job.status !== 'cancelled' && recruitDone
  const shownDay = day && dates.includes(day) ? day : null
  const order = { approved: 0, applied: 1, rejected: 2, cancelled: 3 }
  // 정렬: 지원순(기본) · 평점 높은 순 · 경험 많은 순 · 성실한 순(노쇼·귀가 조치·지각 적은 순)
  const avg = (uid: string) => {
    const s = scores[uid]
    return s?.length ? s.reduce((x, y) => x + y, 0) / s.length : 0
  }
  const by: Record<string, (a: AppRow, b: AppRow) => number> = {
    time: () => 0,
    rating: (a, b) => avg(b.user_id) - avg(a.user_id),
    exp: (a, b) => (rel[b.user_id]?.days ?? 0) - (rel[a.user_id]?.days ?? 0),
    reliable: (a, b) => {
      const bad = (u: string) => (rel[u]?.noShow ?? 0) * 3 + (rel[u]?.dismissed ?? 0) * 3 + (rel[u]?.late ?? 0)
      return bad(a.user_id) - bad(b.user_id) || (rel[b.user_id]?.days ?? 0) - (rel[a.user_id]?.days ?? 0)
    },
  }
  const cmp = by[sort] ?? by.time
  const sorted = [...apps]
    .filter((a) => !shownDay || !a.available_dates || a.available_dates.includes(shownDay))
    .sort((a, b) => order[a.status] - order[b.status] || cmp(a, b))

  // 휴대폰: 대기는 펼쳐 두고, 확정은 대기가 있으면 접어 둠, 미선발·취소는 접어 둠 (카드가 길어서)
  // 여러 명 골라 한 번에 확정·미선발 (대기 중인 지원자만) · data-warn: 확정 전에 한 번 더 물어볼 까닭
  const pickBox = (a: AppRow) =>
    a.status === 'applied' && !a.held_at && waiting > 1 ? (
      <label className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg active:bg-bg" aria-label={`${a.user.name} 고르기`}>
        <input
          type="checkbox"
          name="app"
          value={a.id}
          form={BULK_FORM}
          data-warn={minorWarn(a) ? '연소자' : clashOf.has(a.user_id) ? '근무 겹침' : becomes(a) ? '주휴 대상' : undefined}
          className="size-5 accent-brand-600"
        />
      </label>
    ) : null
  const mobileCard = (a: AppRow) => {
    const age = a.user.birth_date ? ageOn(a.user.birth_date, job.start_date) : null
    return (
      // 고르면 카드 테두리가 파랗게 (어떤 사람을 골랐는지 한눈에)
      <div key={a.id} className={`card space-y-2.5 p-4 transition-shadow duration-200 has-checked:ring-2 has-checked:ring-brand-400 ${a.status === 'cancelled' || a.status === 'rejected' ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-3">
          {pickBox(a)}
          <Avatar id={a.user_id} name={a.user.name} photoAt={a.user.photo_at} size="lg" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <Link href={`/admin/workers/${a.user_id}`} className="text-[17px] font-bold">
              {a.user.name}
            </Link>
            {age != null && <span className="text-sm text-mute">만 {age}세</span>}
            {a.user.member_type && a.user.member_type !== 'worker' && (
              <span className={`badge ${MEMBER_TYPES[a.user.member_type].badge}`}>
                {MEMBER_TYPES[a.user.member_type].emoji} {MEMBER_TYPES[a.user.member_type].short}
                {a.user.specialty ? ` · ${a.user.specialty.split(',').slice(0, 2).join('·')}` : ''}
              </span>
            )}
            {scores[a.user_id] && <StarAvg scores={scores[a.user_id]} />}
            {age != null && age < 18 && <span className="badge bg-rose-50 text-rose-600">연소자</span>}
            {minorWarn(a) && <span className="badge bg-rose-600 text-white">🌙 {minorWarn(a)}</span>}
            {isHeld(a) ? (
              <span className="badge ml-auto bg-violet-50 text-violet-700" data-held>
                보류
              </span>
            ) : (
              <span className={`badge ml-auto ${APP_STATUS[a.status].cls}`}>{adminLabel(a.status)}</span>
            )}
          </div>
        </div>
        <p className="text-xs text-mute">
          {relText(a.user_id)} · 지원 {kstDateTime(a.created_at)}
        </p>
        <Clash uid={a.user_id} />
        <Weekly a={a} />
        <Memo uid={a.user_id} />
        <div className="rounded-xl bg-bg px-3 py-2 text-sm text-sub">
          <p>가능일 {a.available_dates ? a.available_dates.map(fmtDate).join(', ') : '전체'}</p>
          {a.message && <p className="text-ink">“{a.message}”</p>}
          {!!a.user.careers?.length && (
            <p className="mt-0.5 text-xs">
              🎪 {careerText(a.user.careers[0])}
              {a.user.careers.length > 1 && ` 외 ${a.user.careers.length - 1}건`}
            </p>
          )}
        </div>
        <ContactButtons phone={a.user.phone} name={a.user.name} />
        {a.status === 'approved' && <PositionInput appId={a.id} value={a.position} listId={`pos-${job.id}`} />}
        <Decide a={a} wide full={fullOf(a).full} fullText={fullOf(a).text} />
      </div>
    )
  }
  const groups: [string, AppRow[], boolean][] = [
    ['대기', sorted.filter((a) => a.status === 'applied' && !a.held_at), true],
    ['보류', sorted.filter(isHeld), waiting === 0],
    ['확정', sorted.filter((a) => a.status === 'approved'), waiting === 0],
    ['미선발·취소', sorted.filter((a) => a.status === 'rejected' || a.status === 'cancelled'), false],
  ]

  return (
    <div className="space-y-4">
      {/* 배치 칸에서 이미 쓴 배치를 골라 넣게 */}
      <datalist id={`pos-${job.id}`}>
        {[...new Set(approved.map((a) => a.position).filter(Boolean))].map((p) => (
          <option key={p} value={p!} />
        ))}
      </datalist>
      {/* 추가 근로 → 주휴수당 (관리자에게만): 확정하면 한 주 15시간을 넘는 대기 지원자 — 한 줄로 */}
      {(() => {
        const n = apps.filter(becomes)
        if (!n.length) return null
        return (
          <Link href={`/admin/weekly?w=${job.start_date}`} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900" data-weekly-impact-summary>
            <b className="min-w-0 flex-1 truncate">확정하면 주휴 대상 {n.length}명 · 약 {won(n.reduce((t, a) => t + (impact.get(a.user_id)?.amount ?? 0), 0))}</b>
            <span aria-hidden className="shrink-0">›</span>
          </Link>
        )
      })()}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sub">
          확정 <b className="text-ink">{approved.length}</b> / 모집 {job.headcount}명 · 대기 {waiting}명{heldN > 0 && ` · 보류 ${heldN}명`}
        </p>
        <GroupContact phones={approved.map((a) => a.user.phone)} label={`확정 ${approved.length}명에게 문자`} body={`[${job.title}] `} />
        <div className="flex flex-wrap gap-2">
          {waiting > 0 && (
            <form action={approveAllApplied.bind(null, job.id)}>
              {/* 모집 인원을 넘기게 되면 한 번 더 확인 */}
              {allOver ? (
                <ConfirmSubmit
                  className="btn-primary btn-sm"
                  confirmText={
                    minorsWaiting
                      ? `연소자 ${minorsWaiting}명(${minorLimits.join('·')}) 포함 · 확정?`
                      : weeklyWaiting && !dates.some((d) => byDay[d] + waitByDay[d] > job.headcount)
                        ? `주휴 대상 ${weeklyWaiting}명 생겨요 · 모두 확정?`
                        : multi
                        ? `모집 ${job.headcount}명을 넘는 날이 있어요 · 확정?`
                        : `모집 ${job.headcount}명 → ${approved.length + waiting}명 돼요 · 확정?`
                  }
                >
                  대기 {waiting}명 모두 확정
                </ConfirmSubmit>
              ) : (
                <SubmitButton className="btn-primary btn-sm">대기 {waiting}명 모두 확정</SubmitButton>
              )}
            </form>
          )}
          {canRejectWaiting && (
            <form action={rejectWaiting.bind(null, job.id)}>
              <ConfirmSubmit className="btn-gray btn-sm" confirmText={`대기 ${waiting}명 미선발 · 알림 보낼까요?`}>
                🙏 대기 {waiting}명 미선발 알림
              </ConfirmSubmit>
            </form>
          )}
          {canAddDirect && (
            <form action={addWorkerToJob.bind(null, job.id)} className="flex gap-1">
              <input name="phone" className="input w-40 py-1.5 text-sm" placeholder="가입자 휴대폰 번호" inputMode="tel" />
              <SubmitButton className="btn-gray btn-sm">직접 추가</SubmitButton>
            </form>
          )}
        </div>
      </div>
      {/* 여러 날 행사: 날짜별 확정 인원 (모자란 날은 빨갛게) · 누르면 그날 가능한 사람만 */}
      {multi && (
        <div className="space-y-2">
          <div className="fade-x flex gap-1.5 overflow-x-auto pb-1">
            {dates.map((d) => {
              const short = d >= today && byDay[d] < job.headcount
              const on = shownDay === d
              return (
                <Link
                  key={d}
                  href={`/admin/jobs/${job.id}?tab=apps${sort === 'time' ? '' : `&sort=${sort}`}${on ? '' : `&day=${d}`}`}
                  scroll={false}
                  className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-1.5 text-xs font-semibold ring-1 transition active:scale-95 ${
                    on ? 'bg-ink text-white ring-ink' : short ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-white text-sub ring-line'
                  }`}
                >
                  <span>{fmtDate(d)}</span>
                  <span className="tabular-nums">
                    확정 {byDay[d]}/{job.headcount}
                    {short && !on && ` · ${job.headcount - byDay[d]} 부족`}
                  </span>
                </Link>
              )
            })}
          </div>
          {shownDay && (
            <p className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
              <span>
                <b>{fmtDate(shownDay)}</b>에 근무할 수 있는 사람만 보는 중 · 대기 {waitByDay[shownDay]}명
              </span>
              <Link href={`/admin/jobs/${job.id}?tab=apps`} scroll={false} className="shrink-0 font-semibold underline">
                전체 보기
              </Link>
            </p>
          )}
        </div>
      )}
      {apps.length > 1 && (
        <div className="fade-x flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              ['time', '지원순'],
              ['rating', '평점 높은 순'],
              ['exp', '경험 많은 순'],
              ['reliable', '성실한 순'],
            ] as const
          ).map(([k, label]) => (
            <Link
              key={k}
              href={`/admin/jobs/${job.id}?tab=apps${k === 'time' ? '' : `&sort=${k}`}${shownDay ? `&day=${shownDay}` : ''}`}
              scroll={false}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition active:scale-95 ${
                sort === k ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
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
                <div key={label} className="stagger space-y-2" data-app-group={label}>
                  {label !== '대기' ? (
                    <h3 className="pt-2 text-sm font-bold text-sub">{label} {list.length}명</h3>
                  ) : (
                    waiting > 1 && (
                      // 여러 명을 한 번에: 모두 고른 뒤 아래 막대에서 확정·미선발
                      <div className="flex items-center justify-between gap-2 pl-1">
                        <h3 className="text-sm font-bold text-sub">대기 {list.length}명</h3>
                        <PickAll label="모두 고르기" />
                      </div>
                    )
                  )}
                  {list.map(mobileCard)}
                </div>
              ) : (
                <details key={label} className="pt-2" data-app-group={label}>
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
                  <th className="whitespace-nowrap">
                    {waiting > 1 && (
                      <span className="mr-1 inline-block align-middle">
                        <PickAll />
                      </span>
                    )}
                    이름
                  </th>
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
                    <tr key={a.id} className={`[&:has(:checked)>td]:bg-brand-50 ${a.status === 'cancelled' || a.status === 'rejected' ? 'opacity-50' : ''}`}>
                      <td className="whitespace-nowrap">
                        <span className="mr-1 inline-block align-middle">{pickBox(a)}</span>
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
                        {minorWarn(a) && <span className="badge ml-1 bg-rose-600 text-white">🌙 {minorWarn(a)}</span>}
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
                        {!!a.user.careers?.length && (
                          <div className="mt-0.5">
                            🎪 {careerText(a.user.careers[0])}
                            {a.user.careers.length > 1 && ` 외 ${a.user.careers.length - 1}건`}
                          </div>
                        )}
                      </td>
                      <td className="text-xs whitespace-nowrap text-sub">
                        {relText(a.user_id)}
                        <div>
                          <Clash uid={a.user_id} />
                          <Weekly a={a} />
                          <Memo uid={a.user_id} />
                        </div>
                      </td>
                      <td className="text-xs whitespace-nowrap text-mute">{kstDateTime(a.created_at)}</td>
                      <td>
                        {isHeld(a) ? <span className="badge bg-violet-50 text-violet-700">보류</span> : <span className={`badge ${APP_STATUS[a.status].cls}`}>{adminLabel(a.status)}</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        <Decide a={a} full={fullOf(a).full} fullText={fullOf(a).text} />
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
      {/* 고른 지원자가 있으면 아래에 붙는 '미선발 n명 · 선택 n명 확정' */}
      {waiting > 1 && (
        <BulkApproveBar
          approve={decideSelected.bind(null, job.id, 'approved')}
          reject={decideSelected.bind(null, job.id, 'rejected')}
          headcount={job.headcount}
          approved={approved.length}
        />
      )}
    </div>
  )
}
