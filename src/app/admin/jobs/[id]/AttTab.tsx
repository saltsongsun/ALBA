import Link from 'next/link'
import { addAttendance, bulkClockOut, confirmDay, deleteAttendance, rateQuick, saveAttendance } from '@/app/actions/admin'
import { PositionInput, QuickRate } from '@/components/admin'
import AutoRefresh from '@/components/AutoRefresh'
import Avatar from '@/components/Avatar'
import { ContactButtons } from '@/components/Contact'
import { GroupContact } from '@/components/GroupContact'
import LiveNumber from '@/components/LiveNumber'
import { ConfirmSubmit, CopyButton, SubmitButton } from '@/components/ui'
import { phoneFmt, won } from '@/lib/format'
import { calcDay } from '@/lib/pay'
import { fmtDate, kstAt, kstDate, kstTime, minutesText, toKstInput } from '@/lib/time'
import type { Attendance, Job } from '@/lib/types'
import type { AppRow, WorkerLite } from './page'

export default function AttTab({
  job,
  apps,
  atts,
  users,
  date,
  dates,
  myScores,
  pos,
}: {
  job: Job
  apps: AppRow[]
  atts: Attendance[]
  users: Map<string, WorkerLite>
  date: string
  dates: string[]
  myScores: Record<string, number>
  /** 배치로 거르기 ('-'는 미배치, null이면 전체) */
  pos: string | null
}) {
  const dayAtts = atts.filter((a) => a.work_date === date)
  const byUser = new Map(dayAtts.map((a) => [a.user_id, a]))
  const roster = [
    ...apps.filter((a) => !a.available_dates || a.available_dates.includes(date) || byUser.has(a.user_id)).map((a) => a.user_id),
    ...dayAtts.map((a) => a.user_id),
  ].filter((v, i, arr) => arr.indexOf(v) === i)
  const notScheduled = apps.filter((a) => !roster.includes(a.user_id))
  const absent = roster.filter((u) => !byUser.has(u))
  const today = kstDate()
  const working = dayAtts.filter((a) => !a.clock_out).length
  const done = dayAtts.filter((a) => a.clock_out).length
  // 배치: 같은 배치끼리 모아 보여 주고, 배치별로 거를 수 있게 (미배치는 맨 뒤)
  const appOf = new Map(apps.map((a) => [a.user_id, a]))
  const posOf = (uid: string) => appOf.get(uid)?.position ?? ''
  const positions = [...new Set(apps.map((a) => a.position).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, 'ko'))
  const ordered = [...roster].sort((a, b) => (posOf(a) || '\uffff').localeCompare(posOf(b) || '\uffff', 'ko'))
  const shown = pos === null ? ordered : ordered.filter((u) => posOf(u) === (pos === '-' ? '' : pos))
  const posHref = (p: string | null) => `/admin/jobs/${job.id}?tab=att&date=${date}${p === null ? '' : `&pos=${encodeURIComponent(p)}`}`

  return (
    <div className="space-y-4">
      {/* 날짜 (행사가 여러 날이면 옆으로 넘김) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {dates.map((d) => {
          const n = atts.filter((a) => a.work_date === d).length
          return (
            <Link
              key={d}
              href={`/admin/jobs/${job.id}?tab=att&date=${d}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition active:scale-95 ${
                d === date ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'
              }`}
            >
              {fmtDate(d)}
              {n > 0 && <span className={`rounded-full px-1.5 text-xs ${d === date ? 'bg-white/20' : 'bg-bg'}`}>{n}</span>}
            </Link>
          )
        })}
      </div>

      {/* 이날 현황: 근무 중 · 종료 · 미출근 */}
      <div className="card p-4">
        <div className="grid grid-cols-3 divide-x divide-line text-center">
          {(
            [
              ['근무 중', working, 'text-emerald-600'],
              ['종료', done, 'text-ink'],
              ['미출근', absent.length, absent.length && date <= today ? 'text-rose-500' : 'text-mute'],
            ] as const
          ).map(([label, n, tone]) => (
            <div key={label}>
              <p className="text-xs font-semibold text-mute">{label}</p>
              <p className={`mt-0.5 text-2xl font-extrabold ${tone}`}>
                <LiveNumber value={n} />
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-bg">
          <div className="bg-emerald-500 transition-[width] duration-500" style={{ width: `${(working / Math.max(roster.length, 1)) * 100}%` }} />
          <div className="bg-ink/60 transition-[width] duration-500" style={{ width: `${(done / Math.max(roster.length, 1)) * 100}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-mute">
          <span>명단 {roster.length}명</span>
          {date === today && <AutoRefresh />}
        </div>
      </div>

      {/* 할 일: 한 줄로 (넘치면 옆으로 넘김) */}
      {roster.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {date <= today && absent.length > 0 && (
            <GroupContact
              copy={false}
              className="chip-primary"
              phones={absent.map((u) => users.get(u)?.phone)}
              label={`미출근 ${absent.length}명 문자`}
              body={`[${job.title}] 출근 확인 부탁드립니다. 현장에 도착하면 앱에서 '근무 시작'을 눌러 주세요.`}
            />
          )}
          <GroupContact copy={false} className="chip" phones={roster.map((u) => users.get(u)?.phone)} label={`전체 ${roster.length}명 문자`} body={`[${job.title}] `} />
          <CopyButton text={roster.map((u) => phoneFmt(users.get(u)?.phone)).filter(Boolean).join(', ')} label="번호 복사" className="chip" />
          {working > 0 && (
            <form action={bulkClockOut.bind(null, job.id, date)} className="shrink-0">
              <ConfirmSubmit className="chip" confirmText={`${working}명 종료할까요?`}>
                미종료 일괄 종료
              </ConfirmSubmit>
            </form>
          )}
          {done > 0 && (
            <form action={confirmDay.bind(null, job.id, date)} className="shrink-0">
              <SubmitButton className="chip" pendingText="확정 중…">
                이날 근무 확정
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {/* 배치별 보기 (배치를 하나라도 정했을 때만) */}
      {positions.length > 0 && roster.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              [null, '전체', roster.length],
              ...positions.map((p) => [p, p, roster.filter((u) => posOf(u) === p).length] as const),
              ['-', '미배치', roster.filter((u) => !posOf(u)).length],
            ] as const
          ).map(([value, label, n]) => (
            <Link
              key={label}
              href={posHref(value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition active:scale-95 ${
                pos === value ? 'bg-brand-600 text-white' : 'bg-white text-sub ring-1 ring-line'
              }`}
            >
              {label} {n}
            </Link>
          ))}
        </div>
      )}
      <datalist id={`pos-${job.id}`}>
        {positions.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="stagger space-y-2">
        {roster.length === 0 && <div className="card py-10 text-center text-mute">이날 근무 명단이 없습니다.</div>}
        {roster.length > 0 && shown.length === 0 && <div className="card py-8 text-center text-mute">이 배치에 해당하는 사람이 없습니다.</div>}
        {shown.map((uid) => {
          const u = users.get(uid)
          const a = byUser.get(uid)
          const pay = a ? calcDay(job, a) : null
          const far = (d: number | null) => d != null && d > job.gps_radius_m
          const status = !a
            ? { label: '미출근', cls: date <= today ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-mute' }
            : !a.clock_out
              ? { label: '근무 중', cls: 'bg-emerald-50 text-emerald-700' }
              : a.confirmed
                ? { label: '확정', cls: 'bg-ink text-white' }
                : { label: '종료', cls: 'bg-gray-100 text-sub' }
          return (
            <div key={uid} className="card p-4">
              <div className="flex items-center gap-3">
                {/* 얼굴 사진 (눌러서 크게) + 오른쪽 아래 상태 점 */}
                <span className="relative shrink-0">
                  <Avatar id={uid} name={u?.name ?? '?'} photoAt={u?.photo_at} size="lg" />
                  <span className="absolute right-0 bottom-0 flex size-3.5 rounded-full ring-2 ring-white">
                    {a && !a.clock_out && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
                    <span className={`relative inline-flex size-3.5 rounded-full ${!a ? 'bg-gray-300' : !a.clock_out ? 'bg-emerald-500' : a.confirmed ? 'bg-ink' : 'bg-brand-500'}`} />
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/workers/${uid}`} className="block truncate text-[17px] font-bold">
                    {u?.name ?? '알 수 없음'}
                  </Link>
                  {appOf.get(uid) && <PositionInput appId={appOf.get(uid)!.id} value={appOf.get(uid)!.position} listId={`pos-${job.id}`} />}
                </div>
                <span className={`badge shrink-0 ${status.cls}`}>{status.label}</span>
              </div>

              {a && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-semibold tabular-nums">
                    {kstTime(a.adj_in ?? a.clock_in)} ~ {a.adj_out ?? a.clock_out ? kstTime((a.adj_out ?? a.clock_out)!) : '근무 중'}
                  </span>
                  {pay && !pay.incomplete && (
                    <span className="text-sub">
                      · {minutesText(pay.paidMin)} · {won(pay.gross)}
                    </span>
                  )}
                  {(() => {
                    const diff = (new Date(a.clock_in).getTime() - kstAt(a.work_date, job.start_time).getTime()) / 60_000
                    if (diff > 5) return <span className="badge bg-rose-50 text-rose-600">지각 {Math.round(diff)}분</span>
                    if (diff < -10) return <span className="badge bg-sky-50 text-sky-700">조기 {Math.round(-diff)}분{job.early_clamp ? '(미인정)' : ''}</span>
                    return null
                  })()}
                  {(a.adj_in || a.adj_out) && <span className="badge bg-amber-50 text-amber-700">보정</span>}
                  {a.source === 'admin' && <span className="badge bg-gray-100 text-sub">관리자 등록</span>}
                  {(far(a.in_distance_m) || far(a.out_distance_m)) && <span className="badge bg-rose-50 text-rose-600">위치 벗어남</span>}
                  {a.paid && <span className="badge bg-emerald-50 text-emerald-700">지급</span>}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <ContactButtons phone={u?.phone} name={u?.name} showNumber={false} />
                {/* 관리자끼리만 보는 별점 (다시 누르면 바뀜) */}
                <span className="inline-flex items-center gap-1 text-xs text-mute">
                  평가
                  <QuickRate action={rateQuick.bind(null, uid, job.id)} score={myScores[uid] ?? null} />
                </span>
              </div>

              {a ? (
                <details className="mt-3 border-t border-line pt-2.5">
                  <summary className="cursor-pointer text-sm font-semibold text-sub">기록 보기 · 수정</summary>
                  <div className="mt-2 rounded-xl bg-bg px-3 py-2 text-xs text-sub">
                    앱 기록: 출근 {kstTime(a.clock_in)}
                    {a.in_distance_m != null && ` (현장에서 ${a.in_distance_m}m)`} · 퇴근 {a.clock_out ? kstTime(a.clock_out) : '없음'}
                    {a.out_distance_m != null && ` (${a.out_distance_m}m)`}
                    {pay && !pay.incomplete && ` · 체류 ${minutesText(pay.spanMin)}, 휴게 ${pay.breakMin}분`}
                    {pay && pay.overtimeMin > 0 && `, 연장 ${minutesText(pay.overtimeMin)}`}
                    {pay && pay.nightMin > 0 && `, 야간 ${minutesText(pay.nightMin)}`}
                    {a.note && <div className="mt-1">메모: {a.note}</div>}
                  </div>
                  <form action={saveAttendance.bind(null, a.id)} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
                    <label className="col-span-2 sm:col-span-2">
                      <span className="label">출근</span>
                      <input type="datetime-local" name="adj_in" className="input py-2 text-sm" defaultValue={toKstInput(a.adj_in ?? a.clock_in)} />
                    </label>
                    <label className="col-span-2 sm:col-span-2">
                      <span className="label">퇴근</span>
                      <input type="datetime-local" name="adj_out" className="input py-2 text-sm" defaultValue={toKstInput(a.adj_out ?? a.clock_out)} />
                    </label>
                    <label>
                      <span className="label">휴게(분)</span>
                      <input type="number" name="break_override" className="input py-2 text-sm" defaultValue={a.break_override ?? ''} placeholder="규칙대로" />
                    </label>
                    <label>
                      <span className="label">추가지급</span>
                      <input type="number" name="extra_pay" className="input py-2 text-sm" defaultValue={a.extra_pay} step={1000} />
                    </label>
                    <label>
                      <span className="label">기타공제</span>
                      <input type="number" name="deduction" className="input py-2 text-sm" defaultValue={a.deduction} step={1000} />
                    </label>
                    <label className="col-span-2 sm:col-span-4">
                      <span className="label">메모</span>
                      <input name="note" className="input py-2 text-sm" defaultValue={a.note ?? ''} placeholder="지각·조퇴 사유 등" />
                    </label>
                    <label className="flex items-end gap-2 pb-2 text-sm font-semibold">
                      <input type="checkbox" name="confirmed" defaultChecked={a.confirmed} className="size-5 accent-brand-600" />
                      확정
                    </label>
                    <div className="col-span-2 flex items-end gap-2 sm:col-span-6">
                      <SubmitButton className="btn-primary btn-sm">저장</SubmitButton>
                    </div>
                  </form>
                  <form action={deleteAttendance.bind(null, a.id)} className="mt-2 text-right">
                    <ConfirmSubmit className="btn-danger btn-sm" confirmText="기록을 삭제할까요?">
                      기록 삭제
                    </ConfirmSubmit>
                  </form>
                </details>
              ) : (
                <details className="mt-3 border-t border-line pt-2.5">
                  <summary className="cursor-pointer text-sm font-semibold text-sub">수기로 출퇴근 등록</summary>
                  <form action={addAttendance.bind(null, job.id)} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="user_id" value={uid} />
                    <input type="hidden" name="work_date" value={date} />
                    <label>
                      <span className="label">출근</span>
                      <input type="time" name="in" className="input py-2 text-sm" defaultValue={job.start_time.slice(0, 5)} />
                    </label>
                    <label>
                      <span className="label">퇴근</span>
                      <input type="time" name="out" className="input py-2 text-sm" defaultValue={job.end_time.slice(0, 5)} />
                    </label>
                    <input name="note" className="input w-48 py-2 text-sm" placeholder="사유 (휴대폰 방전 등)" />
                    <SubmitButton className="btn-gray btn-sm">등록</SubmitButton>
                  </form>
                </details>
              )}
            </div>
          )
        })}
      </div>
      {notScheduled.length > 0 && (
        <p className="text-xs text-mute">
          이날 근무 불가로 지원한 확정자: {notScheduled.map((a) => a.user.name).join(', ')}
        </p>
      )}
    </div>
  )
}
