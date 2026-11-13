import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PayslipSheet from '@/components/PayslipSheet'
import { PrintButton } from '@/components/ui'
import { companyJob } from '@/lib/company'
import { db, must } from '@/lib/db'
import { loadWorkerPay } from '@/lib/payroll'
import { requireAdmin } from '@/lib/session'
import { viewerMark } from '@/lib/watermark'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '임금명세서 한 번에 인쇄' }

/** 공고에서 일한 사람 모두의 임금명세서를 한 사람에 한 장씩 (관리자만) */
export default async function AllPayslipsPage(props: PageProps<'/print/payslip/[jobId]'>) {
  const { jobId } = await props.params
  const viewer = await requireAdmin()
  if (!isUuid(jobId)) notFound()
  const job = await companyJob(viewer, jobId)
  if (!job) notFound()
  const ids = [
    ...new Set((must(await db().from('attendance').select('user_id').eq('job_id', jobId)) as { user_id: string }[]).map((a) => a.user_id)),
  ]
  const sheets = (await Promise.all(ids.map((uid) => loadWorkerPay(viewer, jobId, uid))))
    .filter((d) => d !== null)
    .sort((a, b) => a.worker.name.localeCompare(b.worker.name, 'ko'))
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-2">
        <Link href={`/admin/jobs/${jobId}?tab=pay`} className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 돌아가기
        </Link>
        <p className="text-sm text-sub">{sheets.length}명 · 한 사람에 한 장</p>
        {sheets.length > 0 && <PrintButton />}
      </div>
      {sheets.length === 0 ? (
        <div className="card py-10 text-center text-mute">아직 근무 기록이 없어요.</div>
      ) : (
        sheets.map((d, i) => (
          <PayslipSheet key={d.worker.id} data={d} className={i < sheets.length - 1 ? 'break-after-page' : ''} watermark={viewerMark(viewer)} />
        ))
      )}
    </div>
  )
}
