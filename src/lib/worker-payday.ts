import { db } from './db'
import { paydayDate, paydayGuess, paydayLabel } from './payday'
import { ASK_PAYLATE, parsePayday, SIGNAL } from './signals'
import { kstDate } from './time'
import type { Job } from './types'

type PJob = Pick<Job, 'id' | 'pay_day' | 'end_date'>

/** 근무자 한 사람의 공고별 정산일 — 내 근무 홈 '근무 내역 · 급여'와 '지난 근무'가 같은 말을 쓰게 */
export type WorkerPaydays = {
  /** 보여 줄 날짜 말 ('11/25(화)' · '11/25(화)까지') — 담당자가 알린 말, 없으면 공고 지급일로 · 모르면 null */
  label: (job: PJob) => string | null
  /** 약속한 날짜 (YYYY-MM-DD) — 알린 말이 날짜 모양이 아니거나 모르면 null */
  due: (job: PJob) => string | null
  /** 그 정산일 뒤에 '급여가 아직…' 문의를 보냈는지 (같은 문의를 또 보내지 않게) */
  asked: (job: PJob) => boolean
}

/**
 * 담당자가 알린 '💰 정산 예정일' (공고별 마지막 안내 · 연도는 알린 날 기준) + 근무자가 보낸 '정산일 지남' 문의.
 * 내 대화(thread_user_id)만 읽음 — 회사가 여럿이어도 공고(job_id)로 나뉨 ·
 * companyId를 주면 그 회사 문의함 글만 (관리자 화면: 다른 회사가 보낸 안내·받은 문의는 읽지 않음)
 */
export async function workerPaydays(userId: string, companyId?: string): Promise<WorkerPaydays> {
  const lateHead = ASK_PAYLATE.slice(0, 12)
  type M = { job_id: string | null; body: string; created_at: string }
  const base = (fromAdmin: boolean) => {
    const q = db().from('messages').select('job_id, body, created_at').eq('thread_user_id', userId).eq('from_admin', fromAdmin)
    return companyId ? q.eq('company_id', companyId) : q
  }
  const [told, askedOn] = await Promise.all([
    base(true)
      .like('body', `${SIGNAL.payday}%`)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(
        (r) => {
          const out = new Map<string, { label: string; date: string | null }>()
          const rows = ((r.data ?? []) as M[]).filter((m) => m.body.startsWith(SIGNAL.payday)).sort((a, b) => b.created_at.localeCompare(a.created_at))
          for (const m of rows) {
            const label = parsePayday(m.body)
            if (m.job_id && label && !out.has(m.job_id)) out.set(m.job_id, { label, date: paydayDate(label, kstDate(new Date(m.created_at))) })
          }
          return out
        },
        () => new Map<string, { label: string; date: string | null }>(),
      ),
    base(false)
      .like('body', `${lateHead}%`)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(
        (r) => {
          const last = new Map<string, string>()
          for (const m of (r.data ?? []) as M[]) {
            const d = kstDate(new Date(m.created_at))
            if (m.job_id && m.body.startsWith(lateHead) && d > (last.get(m.job_id) ?? '')) last.set(m.job_id, d)
          }
          return last
        },
        () => new Map<string, string>(),
      ),
  ])
  const due = (job: PJob) => (told.has(job.id) ? (told.get(job.id)!.date ?? null) : (paydayGuess(job.pay_day, job.end_date)?.date ?? null))
  return {
    label: (job) => told.get(job.id)?.label ?? paydayLabel(job.pay_day, job.end_date),
    due,
    asked: (job) => {
      const d = due(job)
      return !!d && (askedOn.get(job.id) ?? '') >= d
    },
  }
}

/** 오늘부터 그날까지 며칠 (지났으면 음수) */
export function daysUntil(date: string, today: string): number {
  const at = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((at(date) - at(today)) / 86_400_000)
}
