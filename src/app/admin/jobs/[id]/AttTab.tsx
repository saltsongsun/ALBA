import Link from 'next/link'
import { addAttendance, bulkClockOut, confirmDay, deleteAttendance, saveAttendance } from '@/app/actions/admin'
import { ContactButtons } from '@/components/Contact'
import { GroupContact } from '@/components/GroupContact'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { won } from '@/lib/format'
import { calcDay } from '@/lib/pay'
import { fmtDate, kstAt, kstTime, minutesText, toKstInput } from '@/lib/time'
import type { Attendance, Job } from '@/lib/types'
import type { AppRow, WorkerLite } from './page'

export default function AttTab({
  job,
  apps,
  atts,
  users,
  date,
  dates,
}: {
  job: Job
  apps: AppRow[]
  atts: Attendance[]
  users: Map<string, WorkerLite>
  date: string
  dates: string[]
}) {
  const dayAtts = atts.filter((a) => a.work_date === date)
  const byUser = new Map(dayAtts.map((a) => [a.user_id, a]))
  const roster = [
    ...apps.filter((a) => !a.available_dates || a.available_dates.includes(date) || byUser.has(a.user_id)).map((a) => a.user_id),
    ...dayAtts.map((a) => a.user_id),
  ].filter((v, i, arr) => arr.indexOf(v) === i)
  const notScheduled = apps.filter((a) => !roster.includes(a.user_id))
  const working = dayAtts.filter((a) => !a.clock_out).length
  const done = dayAtts.filter((a) => a.clock_out).length

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {dates.map((d) => {
          const n = atts.filter((a) => a.work_date === d).length
          return (
            <Link
              key={d}
              href={`/admin/jobs/${job.id}?tab=att&date=${d}`}
              className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${d === date ? 'bg-ink text-white' : 'bg-white text-sub'}`}
            >
              {fmtDate(d)}
              {n > 0 && <span className="ml-1 opacity-70">{n}</span>}
            </Link>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-bold text-emerald-600">근무 중 {working}</span> · 종료 {done} · 미출근{' '}
          {roster.filter((u) => !byUser.has(u)).length} <span className="text-mute">/ 명단 {roster.length}명</span>
        </p>
        <GroupContact phones={roster.map((u) => users.get(u)?.phone)} label={`이날 명단 ${roster.length}명에게 문자`} body={`[${job.title}] `} />
        <div className="flex gap-2">
          {working > 0 && (
            <form action={bulkClockOut.bind(null, job.id, date)}>
              <ConfirmSubmit className="btn-soft btn-sm" confirmText={`${working}명 종료 처리?`}>
                미종료 일괄 종료
              </ConfirmSubmit>
            </form>
          )}
          {done > 0 && (
            <form action={confirmDay.bind(null, job.id, date)}>
              <SubmitButton className="btn-primary btn-sm">이날 근무 확정</SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {roster.length === 0 && <div className="card py-10 text-center text-mute">이날 근무 명단이 없습니다.</div>}
        {roster.map((uid) => {
          const u = users.get(uid)
          const a = byUser.get(uid)
          const pay = a ? calcDay(job, a) : null
          const far = (d: number | null) => d != null && d > job.gps_radius_m
          return (
            <div key={uid} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`size-2.5 rounded-full ${!a ? 'bg-gray-300' : !a.clock_out ? 'bg-emerald-500' : a.confirmed ? 'bg-ink' : 'bg-brand-500'}`}
                  />
                  <Link href={`/admin/workers/${uid}`} className="font-bold">
                    {u?.name ?? '알 수 없음'}
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  {!a && <span className="text-mute">미출근</span>}
                  {a && (
                    <>
                      <span className="font-semibold">
                        {kstTime(a.adj_in ?? a.clock_in)} ~ {a.adj_out ?? a.clock_out ? kstTime((a.adj_out ?? a.clock_out)!) : '근무 중'}
                      </span>
                      {pay && !pay.incomplete && (
                        <span className="text-sub">
                          {minutesText(pay.paidMin)} · {won(pay.gross)}
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
                      {a.confirmed && <span className="badge bg-ink text-white">확정</span>}
                      {a.paid && <span className="badge bg-emerald-50 text-emerald-700">지급</span>}
                    </>
                  )}
                </div>
              </div>

              <div className="mt-2">
                <ContactButtons phone={u?.phone} name={u?.name} />
              </div>

              {a ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-600">기록 보기 · 수정</summary>
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
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-mute">수기로 출퇴근 등록</summary>
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
