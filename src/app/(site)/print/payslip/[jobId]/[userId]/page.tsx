import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import NoEndNote from '@/components/NoEndNote'
import PayslipSheet from '@/components/PayslipSheet'
import { PrintButton } from '@/components/ui'
import { loadWorkerPay } from '@/lib/payroll'
import { requireUser } from '@/lib/session'
import { viewerMark } from '@/lib/watermark'

export const metadata: Metadata = { title: '임금명세서' }

export default async function PayslipPage(props: PageProps<'/print/payslip/[jobId]/[userId]'>) {
  const { jobId, userId } = await props.params
  const viewer = await requireUser(`/print/payslip/${jobId}/${userId}`)
  const data = await loadWorkerPay(viewer, jobId, userId)
  if (!data) notFound()
  // 마친 근무도 지급액도 없으면 0원 명세서 — 인쇄 버튼은 숨김 (정기 개선 2026-11-22 23:35)
  const printable = data.total.days > 0 || data.total.gross > 0
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={viewer.id === userId ? '/me' : `/admin/jobs/${jobId}?tab=pay`} className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
          ← 돌아가기
        </Link>
        {printable && <PrintButton />}
      </div>
      {/* 종료 기록이 없는 지난 날: 계산에서 빠져 있음 → 근무자는 담당자에게 알리기, 관리자는 종료 넣기 (인쇄 안 됨) */}
      <NoEndNote rows={data.rows} jobId={jobId} userId={userId} self={viewer.id === userId} />
      <PayslipSheet data={data} watermark={viewerMark(viewer)} self={viewer.id === userId} />
    </div>
  )
}
