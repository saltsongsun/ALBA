import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Logo from '@/components/Logo'
import { QuoteSubmitForm } from '@/components/vendor'
import { getJob, getSettings } from '@/lib/data'
import { db } from '@/lib/db'
import { scheduleText } from '@/lib/docs'
import { won } from '@/lib/format'
import { fmtDate, fmtDateRange, kstDate, kstDateTime } from '@/lib/time'
import type { Quote, QuoteRequest } from '@/lib/types'

export const metadata: Metadata = { title: '견적 요청', robots: { index: false, follow: false } }

/**
 * 외주사가 견적 요청 링크로 여는 화면 (로그인 없음). 링크의 무작위 값(token)으로만 찾음.
 * 보여 주는 것: 우리 회사 이름, 요청 내용·마감일, 연결된 행사의 일정·장소. 다른 업체의 견적은 보이지 않음
 */
export default async function VendorQuotePage(props: PageProps<'/quote/[token]'>) {
  const { token } = await props.params
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound()
  const { data } = await db().from('quotes').select('*').eq('token', token).maybeSingle()
  const q = data as Quote | null
  if (!q) notFound()
  const [{ data: reqData }, { data: vendor }, settings] = await Promise.all([
    db().from('quote_requests').select('*').eq('id', q.request_id).maybeSingle(),
    db().from('vendors').select('name').eq('id', q.vendor_id).maybeSingle(),
    getSettings(),
  ])
  const req = reqData as QuoteRequest | null
  if (!req) notFound()
  const job = req.job_id ? await getJob(req.job_id) : null
  const company = settings.company_name || '해피워크'
  const open = req.status === 'open' && (q.status === 'requested' || q.status === 'submitted')
  const late = open && req.due_date && req.due_date < kstDate()

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-6 pb-16">
      <header className="flex items-center gap-2">
        <Logo />
        <span className="font-extrabold">{company}</span>
        <span className="text-sm text-mute">· 견적 요청</span>
      </header>

      <section className="card space-y-3">
        <p className="text-sm font-semibold text-brand-700">{(vendor as { name: string } | null)?.name ?? '협력업체'} 담당자님께</p>
        <h1 className="text-xl font-extrabold">{req.title}</h1>
        <p className="text-sm text-sub">
          {req.due_date ? (
            <>
              견적 마감 <b className={late ? 'text-rose-600' : 'text-ink'}>{fmtDate(req.due_date)}</b>
              {late && ' (지났지만 아직 받고 있어요)'}
            </>
          ) : (
            '마감일 없음'
          )}
        </p>
        {job && (
          <div className="rounded-xl bg-bg px-3.5 py-3 text-sm">
            <p className="font-semibold">{job.event_name || job.title}</p>
            <p className="text-sub">
              {fmtDateRange(job.start_date, job.end_date)} {scheduleText(job)}
              {job.location_name && ` · ${job.location_name}`}
            </p>
            {job.address && <p className="text-xs text-mute">{job.address}</p>}
          </div>
        )}
        {req.details && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{req.details}</p>}
      </section>

      {q.amount != null && (
        <section className="card space-y-1">
          <p className="text-sm font-semibold text-sub">보내 주신 견적</p>
          <p className="text-2xl font-extrabold tabular-nums">{won(q.amount)}</p>
          <p className="text-xs text-mute">
            부가세 {q.vat_included ? '포함' : '별도'}
            {q.submitted_at && ` · ${kstDateTime(q.submitted_at)}`}
          </p>
        </section>
      )}

      {q.status === 'selected' ? (
        <section className="card py-8 text-center">
          <p className="text-3xl" aria-hidden>
            🎉
          </p>
          <p className="mt-2 font-bold">견적이 선정됐어요</p>
          <p className="mt-1 text-sm text-sub">{company} 담당자가 곧 연락드릴게요.</p>
        </section>
      ) : q.status === 'rejected' ? (
        <section className="card py-8 text-center">
          <p className="font-bold">이번에는 다른 업체와 진행하게 됐어요</p>
          <p className="mt-1 text-sm text-sub">견적을 보내 주셔서 감사합니다. 다음에 또 부탁드릴게요.</p>
        </section>
      ) : !open ? (
        <section className="card py-8 text-center">
          <p className="font-bold">{req.status === 'cancelled' ? '견적 요청이 취소됐어요' : '견적 접수가 마감됐어요'}</p>
          <p className="mt-1 text-sm text-sub">궁금한 점은 {company} 담당자에게 문의해 주세요.</p>
        </section>
      ) : (
        <section className="card space-y-3">
          <h2 className="font-bold">{q.amount != null ? '견적 고치기' : '견적 보내기'}</h2>
          <QuoteSubmitForm token={token} amount={q.amount} vat={q.vat_included} note={q.note} />
          <p className="hint">보낸 견적은 {company}만 볼 수 있어요. 마감 전까지는 다시 보내서 고칠 수 있어요.</p>
        </section>
      )}
      {settings.contact_phone && (
        <p className="text-center text-sm text-sub">
          문의:{' '}
          <a href={`tel:${settings.contact_phone}`} className="font-semibold text-brand-600">
            {settings.contact_name ?? company} {settings.contact_phone}
          </a>
        </p>
      )}
    </div>
  )
}
