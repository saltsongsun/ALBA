import Icon from '@/components/Icon'
import LiveNumber from '@/components/LiveNumber'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import AutoRefresh from '@/components/AutoRefresh'
import OtherCompanyJob from '@/components/OtherCompanyJob'
import { CopyButton, PrintButton } from '@/components/ui'
import { companyJob, jobInMyOtherCompany } from '@/lib/company'
import { getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { EMERGENCY_MEMO, joinCode } from '@/lib/emergency'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { dateList, fmtDate, kstDate, kstTime } from '@/lib/time'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '긴급 투입 QR' }

/** 행사 중 긴급 투입: 이 QR을 새 인력이 찍으면 가입·로그인 후 바로 확정 (오늘만 쓸 수 있는 코드) */
export default async function EmergencyQrPage(props: PageProps<'/admin/jobs/[id]/qr'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  if (!isUuid(id)) notFound()
  const job = await companyJob(admin, id)
  if (!job) {
    // 띄워 둔 QR 화면에서 다른 회사로 바꿨거나 즐겨찾기로 열었을 때: 내가 맡은 회사 공고면 그 회사로 바꿔서 다시 열기 (정기 개선 2026-11-24 05:35)
    const other = await jobInMyOtherCompany(admin, id)
    if (!other) notFound()
    return <OtherCompanyJob title="다른 회사 공고예요" company={other} now={admin.companyName} open={`/admin/jobs/${id}/qr`} />
  }
  const today = kstDate()
  const active = ['open', 'closed'].includes(job.status) && dateList(job.start_date, job.end_date).includes(today)
  const url = `${await siteOrigin()}/join/${job.id}?c=${joinCode(job.id, today)}`
  // 현장에 붙인 QR 종이에도 어느 회사인지 (여러 회사가 같은 행사장에 있을 때 헷갈리지 않게)
  const company = await getSettings(job.company_id).catch(() => null)
  const svg = active ? await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#191f28', light: '#ffffff' } }) : ''
  const joined = active
    ? (must(
        await db()
          .from('applications')
          .select('user_id, decided_at, admin_memo, user:users(name)').eq('company_id', admin.companyId)
          .eq('job_id', job.id)
          .eq('status', 'approved')
          .eq('admin_memo', EMERGENCY_MEMO),
      ) as unknown as { user_id: string; decided_at: string | null; admin_memo: string | null; user: { name: string } | null }[]).filter(
        (a) => a.admin_memo === EMERGENCY_MEMO && a.decided_at && kstDate(a.decided_at) === today,
      )
    : []
  // 합류한 사람의 진행 상태: 서명 대기 → 서명 완료 → 근무 중
  const joinedIds = joined.map((a) => a.user_id)
  const [pendingDocs, todayAtts] = joinedIds.length
    ? await Promise.all([
        db()
          .from('signed_docs')
          .select('user_id').eq('company_id', admin.companyId)
          .eq('job_id', job.id)
          .eq('status', 'pending')
          .in('user_id', joinedIds)
          .then((r) => must(r) as { user_id: string }[]),
        db()
          .from('attendance')
          .select('user_id, clock_out').eq('company_id', admin.companyId)
          .eq('job_id', job.id)
          .eq('work_date', today)
          .in('user_id', joinedIds)
          .then((r) => must(r) as { user_id: string; clock_out: string | null }[]),
      ])
    : [[], []]
  const stateOf = (uid: string) => {
    const att = todayAtts.find((a) => a.user_id === uid)
    if (att) return att.clock_out ? { label: '근무 종료', cls: 'bg-gray-100 text-sub' } : { label: '근무 중', cls: 'bg-emerald-50 text-emerald-700' }
    const n = pendingDocs.filter((d) => d.user_id === uid).length
    return n ? { label: `서명 대기 ${n}건`, cls: 'bg-amber-50 text-amber-700' } : { label: '출근 전', cls: 'bg-brand-50 text-brand-700' }
  }

  return (
    <div className="space-y-4">
      <Link href={`/admin/jobs/${job.id}?tab=att`} className="tap no-print text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 출퇴근으로
      </Link>
      <div className="print-sheet card mx-auto max-w-md space-y-4 text-center">
        <p className="flex items-center justify-center gap-1 text-sm font-bold text-rose-600">
          <Icon name="qr" /> 긴급 투입
        </p>
        <h1 className="text-xl font-extrabold">{job.title}</h1>
        {company?.company_name && (
          <p className="-mt-2 text-sm font-semibold text-sub" data-qr-company>
            🏢 {company.company_name}
          </p>
        )}
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
          {/* 자동 갱신 글자(시각 포함)가 길어지면 제목을 두 줄로 꺾지 않고 아래 줄로 내려감 */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            {/* 새로 합류하면 숫자가 톡 · 새 줄은 살짝 올라오며 · 상태(서명 대기 → 출근 전 → 근무 중)가 바뀐 배지만 톡 (정기 개선 2026-11-24 05:35) */}
            <h2 className="font-bold whitespace-nowrap" data-qr-joined-count={joined.length}>
              오늘 QR로 합류한 사람 <LiveNumber value={joined.length} />명
            </h2>
            {/* QR을 띄워 둔 채로 합류·서명·출근이 바로 보이게 */}
            <AutoRefresh seconds={10} />
          </div>
          {joined.length === 0 ? (
            <p className="mt-1 text-sm text-mute" data-qr-joined-empty>
              아직 없어요 · 찍으면 여기에 바로 떠요
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {joined.map((a) => (
                <li key={a.user_id} className="flex animate-[rise_0.25s_var(--ease-spring)_both] items-center justify-between gap-2 py-2" data-qr-joined={a.user_id}>
                  <Link href={`/admin/workers/${a.user_id}`} className="min-w-0 truncate font-semibold">
                    {a.user?.name ?? '알 수 없음'}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs whitespace-nowrap text-mute">{kstTime(a.decided_at!)} 합류</span>
                    <span key={stateOf(a.user_id).label} className={`badge animate-[pop_0.25s_var(--ease-spring)_both] ${stateOf(a.user_id).cls}`} data-qr-state>
                      {stateOf(a.user_id).label}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
