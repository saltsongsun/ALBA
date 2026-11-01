import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PayslipSheet from '@/components/PayslipSheet'
import { PrintButton } from '@/components/ui'
import { loadWorkerPay } from '@/lib/payroll'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: '임금명세서' }

export default async function PayslipPage(props: PageProps<'/print/payslip/[jobId]/[userId]'>) {
  const { jobId, userId } = await props.params
  const viewer = await requireUser(`/print/payslip/${jobId}/${userId}`)
  const data = await loadWorkerPay(viewer, jobId, userId)
  if (!data) notFound()
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={viewer.id === userId ? '/me' : `/admin/jobs/${jobId}?tab=pay`} className="text-sm font-semibold text-sub">
          ← 돌아가기
        </Link>
        <PrintButton />
      </div>
      <PayslipSheet data={data} />
    </div>
  )
}
