import 'server-only'
import { allPages, db } from './db'
import { issueDocsToApproved } from './data'
import { scheduleSummary } from './docs'
import { myWorkTab } from './members'
import { tellWorkers } from './notify'
import { kstDate } from './time'
import type { Job } from './types'

/**
 * 모집이 끝나 확정자에게 서명 서류(근로계약서 등)를 보낼 때: 서류를 만들고, 새로 서류가 생긴 사람에게만 알림 (문의함 + 휴대폰)
 * 사용자 요청 2026-11-24 "근로계약서는 확정 후 작성 말고 모집완료 후 작성으로" — 모집 마감할 때 · 근무 전날 저녁(안전장치)
 */
export async function issueDocsAndTell(job: Job, senderId: string | null, why: 'closed' | 'dayBefore'): Promise<number> {
  const got = await issueDocsToApproved(job)
  if (!got.length) return 0
  await tellWorkers(got, {
    senderId,
    companyId: job.company_id,
    jobId: job.id,
    title: '✍️ 서명할 서류가 왔어요',
    text: [
      job.title,
      scheduleSummary(job),
      why === 'closed' ? '모집이 끝나 서류가 준비됐어요.' : '근무 전에 서명할 서류가 준비됐어요.',
      `앱 ‘${myWorkTab(job.audience)}’에서 근무 전에 서명해 주세요.`,
    ].join('\n'),
    // 알림을 누르면 내 근무의 '서명할 서류' 칸으로 바로 (첫 서명 버튼이 번쩍)
    url: '/me#sign-docs',
    tag: `docs-${job.id}`,
  })
  return got.length
}

/**
 * 안전장치 (매일 저녁 알림 작업에서): 아직 모집 중인데 근무가 내일 안에 시작하는 공고는 확정자에게 서류를 보냄
 * (마감을 깜빡해도 근무 전에 서명하게) · 이미 서류가 있는 사람은 건너뜀
 */
export async function issueDueDocs(): Promise<{ jobs: number; people: number }> {
  const today = kstDate()
  const tomorrow = kstDate(new Date(Date.now() + 86_400_000))
  const jobs = (
    await allPages<Job>((a, b) =>
      db().from('jobs').select('*').eq('status', 'open').lte('start_date', tomorrow).gte('end_date', today).order('id').range(a, b),
    )
  ).filter((j) => j.status === 'open' && j.start_date <= tomorrow && j.end_date >= today && (j.required_docs?.length ?? 0) > 0)
  let people = 0
  let n = 0
  for (const job of jobs) {
    const k = await issueDocsAndTell(job, null, 'dayBefore')
    if (k) {
      n++
      people += k
    }
  }
  return { jobs: n, people }
}
