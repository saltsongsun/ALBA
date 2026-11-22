import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/ui'
import NoEndNote from '@/components/NoEndNote'
import { loadWorkerPay } from '@/lib/payroll'
import { requireUser } from '@/lib/session'
import { viewerMark } from '@/lib/watermark'
import Watermark from '@/components/Watermark'
import { fmtDateLong, kstDate, minutesText } from '@/lib/time'
import SealMark from '@/components/SealMark'

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
  const self = viewer.id === userId
  // 마친 근무가 없으면 빈 확인서 — 인쇄·용도 칸은 숨기고 무엇이 빠졌는지만 (정기 개선 2026-11-22 23:35)
  const printable = worked.length > 0

  return (
    <div className="space-y-4">
      {/* 위 줄: 돌아가기 · 인쇄 / 아래 줄: 용도 (360px에서 세 개가 엉켜 두 줄로 밀리지 않게 줄을 나눔) */}
      <div className="no-print space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Link href={self ? '/me' : `/admin/jobs/${jobId}?tab=pay`} className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
            ← 돌아가기
          </Link>
          {printable && <PrintButton />}
        </div>
        {printable && (
          <form className="flex gap-2" data-cert-purpose>
            <input name="purpose" defaultValue={purpose} maxLength={40} className="input min-w-0 flex-1 py-1.5 text-sm" placeholder="용도 (예: 제출용) · 비워 두면 안 나와요" />
            <button className="btn-gray btn-sm shrink-0 transition active:scale-95">{purpose ? '바꾸기' : '넣기'}</button>
          </form>
        )}
      </div>
      {/* 종료 기록이 없는 지난 날: 계산에서 빠져 있음 → 근무자는 담당자에게 알리기, 관리자는 종료 넣기 (인쇄 안 됨) */}
      <NoEndNote rows={rows} jobId={jobId} userId={userId} self={self} />
      <article className="print-sheet card relative px-6 py-10 sm:px-12">
        <Watermark text={viewerMark(viewer)} />
        <h1 className="mb-10 text-center text-3xl font-extrabold tracking-[0.4em]">근무확인서</h1>
        {worked.length === 0 ? (
          <div className="space-y-1 text-center" data-cert-empty>
            <p className="font-semibold text-sub">{rows.length ? '마친 근무가 아직 없어요' : '이 공고에서 일한 기록이 없어요'}</p>
            <p className="text-sm text-mute">{rows.length ? '근무 종료 기록이 들어가면 확인서가 만들어져요' : '근무를 마치면 확인서가 만들어져요'}</p>
          </div>
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
                    {/* 넣은 용도가 서류에 들어갔다는 걸 짧게 (0.25초 · 움직임 줄이기면 바로) */}
                    <td>
                      <span className="inline-block animate-[pop_0.25s_var(--ease-spring)_both]" data-cert-purpose-value>
                        {purpose}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="my-14 text-center text-lg">위 사람은 위와 같이 근무하였음을 확인합니다.</p>
            <p className="mb-10 text-center font-semibold">{fmtDateLong(kstDate())}</p>
            <div className="mx-auto w-fit text-center">
              <p className="text-lg font-bold">{settings.company_name}</p>
              {settings.company_address && <p className="text-sm text-sub">{settings.company_address}</p>}
              <p className="mt-1">
                대표이사 {settings.ceo_name ?? ''} <SealMark seal={settings.seal_image} size="lg" />
              </p>
            </div>
          </>
        )}
      </article>
    </div>
  )
}
