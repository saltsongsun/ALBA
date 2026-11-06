import { scheduledEnd, shiftOf } from './pay'
import type { Job } from './types'

/**
 * 관리자 화면의 큰 버튼을 고르는 공고 단계 (근무자의 근무 시작/종료처럼 지금 할 일 하나를 크게)
 * · draft: 임시 저장 → 공개하기
 * · before: 행사 전 → 지원자 확인·모집 마감
 * · live: 행사 당일 근무 시간 → 출석 체크
 * · dayOver: 여러 날 행사의 중간 날, 그날 종료 시각 지남 → 오늘 근무 마무리(미종료 일괄 종료)
 * · lastOver: 마지막 날 종료 시각 지남 → 행사 종료하기
 * · after: 마지막 날이 지났는데 아직 종료 안 함 → 행사 종료하기
 * · done / cancelled
 */
export type JobPhase = 'draft' | 'before' | 'live' | 'dayOver' | 'lastOver' | 'after' | 'done' | 'cancelled'

export function jobPhase(job: Pick<Job, 'status' | 'start_date' | 'end_date' | 'start_time' | 'end_time'>, today: string, now = new Date()): JobPhase {
  if (job.status === 'cancelled' || job.status === 'done' || job.status === 'draft') return job.status
  if (today < job.start_date) return 'before'
  if (today > job.end_date) {
    // 밤샘 근무: 마지막 날 근무가 다음 날 새벽에 끝나면 그때까지는 아직 근무 시간
    return now < scheduledEnd(shiftOf(job), job.end_date) ? 'live' : 'after'
  }
  if (now < scheduledEnd(shiftOf(job), today)) return 'live'
  return today === job.end_date ? 'lastOver' : 'dayOver'
}
