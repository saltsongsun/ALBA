import Link from 'next/link'
import { bulkClockOut, duplicateJob, endEvent, setJobStatus } from '@/app/actions/admin'
import StartsIn from '@/components/StartsIn'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { jobPhase } from '@/lib/jobPhase'
import { shiftOf } from '@/lib/pay'
import { dateList, fmtDate, hhmm, kstAt } from '@/lib/time'
import type { Job } from '@/lib/types'

/** 근무자 화면의 '근무 시작·종료'처럼 크게 (지금 할 일 하나) */
const BIG = 'flex w-full items-center justify-center gap-2 rounded-2xl font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60'

type Props = {
  job: Pick<Job, 'id' | 'status' | 'start_date' | 'end_date' | 'start_time' | 'end_time'>
  today: string
  /** 그날(행사가 지났으면 남은 기록 전체) 아직 근무 중 · 퇴근 · 안 온 사람 */
  working: number
  finished?: number
  absent?: number
  /** 확정을 기다리는 지원자 */
  waiting?: number
  /** 확정 인원 · 모집 인원 (다 찼으면 '모집 마감'을 크게) */
  approved?: number
  headcount?: number
  /** 대시보드 카드 안: 작게, 숫자 줄 없이 */
  compact?: boolean
}

/**
 * 관리자 공고의 '지금 할 일' 큰 버튼 (사용자 요청 2026-11-06 "관리자도 근무자처럼 버튼들 만들어줘 · 행사 종료하기 등등").
 * 행사 전: 지원자 확인·모집 마감 / 당일 근무 시간: 출석 체크 / 중간 날 끝: 오늘 근무 마무리 / 마지막 날 끝: 행사 종료하기 / 끝남: 정산하러 가기
 */
export default function JobActions({ job, today, working, finished = 0, absent = 0, waiting = 0, approved = 0, headcount = 0, compact = false }: Props) {
  const phase = jobPhase(job, today)
  if (phase === 'cancelled') return null
  const size = compact ? 'py-3 text-base' : 'py-4 text-lg'
  const base = `/admin/jobs/${job.id}`
  // 당일이라도 시작 시각 전에는 '미출근'·'대신 확정'·'일찍 끝내기'를 보이지 않음 (사용자 지적 2026-11-07: 19:30 행사인데 낮에 '미출근 13')
  const startText = hhmm(shiftOf(job).start_time)
  const startAt = kstAt(today, shiftOf(job).start_time)
  const serverNow = Date.now()
  const started = phase !== 'live' || today > job.end_date || working + finished > 0 || serverNow >= startAt.getTime()
  const counts = !compact && (phase === 'live' || phase === 'dayOver' || phase === 'lastOver') && (!started ? (
    <p className="text-center text-sm font-semibold text-sub" data-job-counts data-before-start>
      오늘 {startText} 시작 · 아직 출근 전이에요
      <StartsIn startAt={startAt.toISOString()} serverNow={serverNow} />
    </p>
  ) : (
    <p className="flex items-center justify-center gap-3 text-sm font-semibold tabular-nums" data-job-counts>
      <span className="text-emerald-700">근무 중 {working}</span>
      <span className="text-line">|</span>
      <span>퇴근 {finished}</span>
      {absent > 0 && (
        <>
          <span className="text-line">|</span>
          <span className="text-rose-600">미출근 {absent}</span>
        </>
      )}
    </p>
  ))
  const endText = hhmm(shiftOf(job).end_time)
  return (
    <div data-job-actions={phase} className="space-y-2">
      {counts}
      {phase === 'draft' && (
        <>
          <p className="text-center text-sm text-sub">임시 저장이에요 · 공개해야 지원을 받아요</p>
          <form action={setJobStatus.bind(null, job.id, 'open')}>
            <SubmitButton className={`${BIG} ${size} bg-brand-600 hover:bg-brand-700`} pendingText="공개하는 중…" track="공고 공개하기">
              공개하기
            </SubmitButton>
          </form>
        </>
      )}
      {phase === 'before' &&
        // 시나리오: 인원이 다 찼는데 지원이 계속 들어옴 → '모집 마감'을 크게
        (job.status === 'open' && headcount > 0 && approved >= headcount ? (
          <>
            <form action={setJobStatus.bind(null, job.id, 'closed')}>
              <ConfirmSubmit className={`${BIG} ${size} bg-brand-600 hover:bg-brand-700`} confirmText="한 번 더 누르면 모집 마감" track="인원 다 참 · 모집 마감">
                인원이 다 찼어요 · 모집 마감
              </ConfirmSubmit>
            </form>
            {waiting > 0 && !compact && (
              <Link href={`${base}?tab=apps`} className="btn-gray w-full" data-track="지원자 확인">
                대기 지원자 {waiting}명 보기
              </Link>
            )}
          </>
        ) : (
          <>
            {waiting > 0 && (
              <Link href={`${base}?tab=apps`} className={`${BIG} ${size} bg-brand-600 hover:bg-brand-700`} data-track="지원자 확인">
                지원자 확인 · 대기 {waiting}명
              </Link>
            )}
            {job.status === 'open' && (
              <form action={setJobStatus.bind(null, job.id, 'closed')}>
                <ConfirmSubmit className="btn-gray w-full" confirmText="한 번 더 누르면 모집 마감" track="모집 마감하기">
                  모집 마감하기
                </ConfirmSubmit>
              </form>
            )}
          </>
        ))}
      {phase === 'live' && (
        <>
          <Link href={`${base}?tab=att&date=${today}&view=check`} className={`${BIG} ${size} bg-emerald-500 hover:bg-emerald-600`} data-track="출석 체크">
            출석 체크{compact && working > 0 ? ` · 근무 중 ${working}명` : ''}
          </Link>
          {/* 시나리오: 당일 결원 → 대기 지원자로 바로 대신 확정 */}
          {!compact && started && absent > 0 && waiting > 0 && (
            <Link href={`${base}?tab=apps`} className="btn-soft w-full" data-substitute data-track="대기자로 대신 확정">
              미출근 {absent}명 · 대기자 {waiting}명 대신 확정
            </Link>
          )}
          {/* 시나리오: 비·사고로 마지막 날 일찍 끝냄 → 근무 중인 사람은 지금 시각으로 종료하고 행사 종료 */}
          {!compact && started && today === job.end_date && (
            <form action={endEvent.bind(null, job.id)}>
              <ConfirmSubmit className="btn-gray w-full" confirmText="한 번 더 누르면 지금 모두 종료" track="행사 일찍 끝내기">
                행사 일찍 끝내기
              </ConfirmSubmit>
            </form>
          )}
        </>
      )}
      {phase === 'dayOver' &&
        (working > 0 ? (
          <form action={bulkClockOut.bind(null, job.id, today)}>
            <ConfirmSubmit className={`${BIG} ${size} bg-rose-500 shadow-rose-200 hover:bg-rose-600`} confirmText={`한 번 더 누르면 ${working}명 종료`} track="오늘 근무 마무리">
              오늘 근무 마무리 · {working}명 종료
            </ConfirmSubmit>
          </form>
        ) : (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">
            ✓ 오늘 근무 끝
            {(() => {
              const next = dateList(job.start_date, job.end_date).find((d) => d > today)
              return next ? ` · 다음 근무일 ${fmtDate(next)}` : ''
            })()}
          </p>
        ))}
      {(phase === 'lastOver' || phase === 'after') && (
        <>
          <form action={endEvent.bind(null, job.id)}>
            <ConfirmSubmit className={`${BIG} ${size} bg-rose-500 shadow-rose-200 hover:bg-rose-600`} confirmText="한 번 더 누르면 행사 종료" track="행사 종료하기">
              🏁 행사 종료하기
            </ConfirmSubmit>
          </form>
          {!compact && (
            <p className="text-center text-xs text-sub" data-job-end-hint>
              {working > 0 ? `근무 중 ${working}명은 종료 시각(${endText})으로 함께 근무 종료돼요` : '모두 퇴근했어요 · 누르면 행사가 끝나고 정산으로 넘어가요'}
            </p>
          )}
        </>
      )}
      {phase === 'done' && (
        <>
          {!compact && <p className="text-center text-sm font-semibold text-emerald-700">🏁 행사가 끝났어요</p>}
          <Link href={`${base}?tab=pay`} className={`${BIG} ${size} bg-brand-600 hover:bg-brand-700`} data-track="정산하러 가기">
            정산하러 가기
          </Link>
          {/* 시나리오: 다음 행사도 같은 팀으로 → 복사해서 새 공고 (새 공고의 지원자 탭에서 이번 근무자 부르기) */}
          {!compact && (
            <form action={duplicateJob.bind(null, job.id)}>
              <SubmitButton className="btn-gray w-full" pendingText="복사하는 중…" track="복사해서 다음 행사">
                복사해서 다음 행사 만들기
              </SubmitButton>
            </form>
          )}
        </>
      )}
    </div>
  )
}
