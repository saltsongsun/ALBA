import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { CopyButton, PrintButton } from '@/components/ui'
import { getJob } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { EMERGENCY_MEMO, joinCode } from '@/lib/emergency'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { dateList, fmtDate, kstDate, kstTime } from '@/lib/time'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '긴급 투입 QR' }

/** 행사 중 긴급 투입: 이 QR을 새 인력이 찍으면 가입·로그인 후 바로 확정 (오늘만 쓸 수 있는 코드) */
export default async function EmergencyQrPage(props: PageProps<'/admin/jobs/[id]/qr'>) {
  await requireAdmin()
  const { id } = await props.params
  if (!isUuid(id)) notFound()
  const job = await getJob(id)
  if (!job) notFound()
  const today = kstDate()
  const active = ['open', 'closed'].includes(job.status) && dateList(job.start_date, job.end_date).includes(today)
  const url = `${await siteOrigin()}/join/${job.id}?c=${joinCode(job.id, today)}`
  const svg = active ? await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#191f28', light: '#ffffff' } }) : ''
  const joined = active
    ? (must(
        await db()
          .from('applications')
          .select('user_id, decided_at, admin_memo, user:users(name)')
          .eq('job_id', job.id)
          .eq('status', 'approved')
          .eq('admin_memo', EMERGENCY_MEMO),
      ) as unknown as { user_id: string; decided_at: string | null; admin_memo: string | null; user: { name: string } | null }[]).filter(
        (a) => a.admin_memo === EMERGENCY_MEMO && a.decided_at && kstDate(a.decided_at) === today,
      )
    : []

  return (
    <div className="space-y-4">
      <Link href={`/admin/jobs/${job.id}?tab=att`} className="no-print text-sm font-semibold text-sub">
        ← 출퇴근으로
      </Link>
      <div className="print-sheet card mx-auto max-w-md space-y-4 text-center">
        <p className="text-sm font-bold text-rose-600">🚨 긴급 투입</p>
        <h1 className="text-xl font-extrabold">{job.title}</h1>
        <p className="text-sm text-sub">
          {fmtDate(today)} {scheduleText(job)}
          {job.location_name && ` · ${job.location_name}`}
        </p>
        {active ? (
          <>
            {/* 라이브러리가 만든 SVG(QR 무늬)만 그대로 넣음 */}
            <div className="mx-auto w-full max-w-72 rounded-2xl bg-white p-3 ring-1 ring-line [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="text-sm font-semibold">휴대폰 카메라로 찍으면 가입(또는 로그인) 후 바로 근무가 확정돼요.</p>
            <p className="hint">오늘({fmtDate(today)})만 쓸 수 있는 QR이에요. 확정되면 서류에 서명하고 출근 버튼을 누르면 돼요.</p>
            <div className="no-print flex justify-center gap-2">
              <CopyButton text={url} label="링크 복사" />
              <PrintButton label="QR 인쇄" />
            </div>
          </>
        ) : (
          <p className="rounded-xl bg-bg px-4 py-6 text-sm text-sub">긴급 투입 QR은 행사 날(진행 중인 공고)에만 만들 수 있어요.</p>
        )}
      </div>
      {active && (
        <section className="no-print card mx-auto max-w-md">
          <h2 className="font-bold">오늘 QR로 합류한 사람 {joined.length}명</h2>
          {joined.length === 0 ? (
            <p className="mt-1 text-sm text-mute">아직 없어요.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {joined.map((a) => (
                <li key={a.user_id} className="flex justify-between py-2">
                  <Link href={`/admin/workers/${a.user_id}`} className="font-semibold">
                    {a.user?.name ?? '알 수 없음'}
                  </Link>
                  <span className="text-mute">{kstTime(a.decided_at!)} 합류</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
