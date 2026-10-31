import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { dateList, kstDate } from './time'
import type { Job } from './types'

/**
 * 긴급 투입 QR 코드: 공고·날짜마다 정해지는 코드 (서버 비밀값으로 만들어 짐작할 수 없음).
 * 그날만 쓸 수 있고 날이 바뀌면 저절로 바뀜
 */
export function joinCode(jobId: string, date: string = kstDate()): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET이 필요합니다.')
  return createHmac('sha256', secret).update(`join|${jobId}|${date}`).digest('base64url').slice(0, 12)
}

/** 오늘 행사 날짜이고 진행 중인 공고이며 코드가 맞는지 */
export function joinOk(job: Pick<Job, 'id' | 'start_date' | 'end_date' | 'status'>, code: string): boolean {
  const today = kstDate()
  if (!['open', 'closed'].includes(job.status) || !dateList(job.start_date, job.end_date).includes(today)) return false
  const a = Buffer.from(joinCode(job.id, today))
  const b = Buffer.from(String(code))
  return a.length === b.length && timingSafeEqual(a, b)
}

export const EMERGENCY_MEMO = '긴급 투입(QR)'
