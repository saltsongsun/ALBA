import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/ui'
import { loadWorkerPay } from '@/lib/payroll'
import { requireUser } from '@/lib/session'
import { fmtDateLong, kstDate, minutesText } from '@/lib/time'

export const metadata: Metadata = { title: '근무확인서' }

export default async function CertPage(props: PageProps<'/print/cert/[jobId]/[userId]'>) {
  const { jobId, userId } = await props.params
  const sp = await props.searchParams
  const viewer = await requireUser(`/print/cert/${jobId}/${userId}`)
  const data = await loadWorkerPay(viewer, jobId, userId)
  if (!data) notFound()
  const { job, settings, worker, rows, total } = data
  const worked = rows.filter((r) => !r.pay.incomplete)
  const purpose = typeof sp.purpose === 'string' ? sp.purpose.slice(0, 40) : ''

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={viewer.id === userId ? '/me' : `/admin/jobs/${jobId}?tab=pay`} className="text-sm font-semibold text-sub">
          ← 돌아가기
        </Link>
        <form className="flex gap-2">
          <input name="purpose" defaultValue={purpose} className="input w-40 py-1.5 text-sm" placeholder="용도 (예: 제출용)" />
          <button className="btn-gray btn-sm">적용</button>
        </form>
        <PrintButton />
      </div>
      <article className="print-sheet card px-6 py-10 sm:px-12">
        <h1 className="mb-10 text-center text-3xl font-extrabold tracking-[0.4em]">근무확인서</h1>
        {worked.length === 0 ? (
          <p className="text-center text-mute">완료된 근무 기록이 없습니다.</p>
        ) : (
          <>
            <table className="table border-t-2 border-ink text-[15px]">
              <tbody>
                <tr>
                  <th className="w-32">성명</th>
                  <td>{worker.name}</td>
                </tr>
                <tr>
                  <th>생년월일</th>
                  <td>{worker.birth_date ? fmtDateLong(worker.birth_date) : '-'}</td>
                </tr>
                {worker.address && (
                  <tr>
                    <th>주소</th>
                    <td>{worker.address}</td>
                  </tr>
                )}
                <tr>
                  <th>근무처</th>
                  <td>{settings.company_name}</td>
                </tr>
                <tr>
                  <th>행사 · 업무</th>
                  <td>
                    {job.event_name || job.title} / {job.task || '행사 운영 보조'}
                  </td>
                </tr>
                <tr>
                  <th>근무기간</th>
                  <td>
                    {fmtDateLong(worked[0].work_date)}
                    {worked.length > 1 ? ` ~ ${fmtDateLong(worked.at(-1)!.work_date)}` : ''}
                  </td>
                </tr>
                <tr>
                  <th>근무일수 · 시간</th>
                  <td>
                    {total.days}일 · 총 {minutesText(total.paidMin)}
                  </td>
                </tr>
                {purpose && (
                  <tr>
                    <th>용도</th>
                    <td>{purpose}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="my-14 text-center text-lg">위 사람은 위와 같이 근무하였음을 확인합니다.</p>
            <p className="mb-10 text-center font-semibold">{fmtDateLong(kstDate())}</p>
            <div className="relative mx-auto w-fit text-center">
              <p className="text-lg font-bold">{settings.company_name}</p>
              {settings.company_address && <p className="text-sm text-sub">{settings.company_address}</p>}
              <p className="mt-1">
                대표이사 {settings.ceo_name ?? ''} <span className="text-mute">(인)</span>
              </p>
              {settings.seal_image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.seal_image} alt="직인" className="absolute -right-14 -bottom-4 size-20 object-contain mix-blend-multiply" />
              )}
            </div>
          </>
        )}
      </article>
    </div>
  )
}
