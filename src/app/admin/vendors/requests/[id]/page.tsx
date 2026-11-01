import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addVendorsToRequest, selectQuote, setRequestStatus, unselectQuote } from '@/app/actions/vendor'
import Flash from '@/components/Flash'
import Fold from '@/components/Fold'
import { GroupContact } from '@/components/GroupContact'
import { ConfirmSubmit, CopyButton, SubmitButton } from '@/components/ui'
import { RecordQuoteForm } from '@/components/vendor'
import { getJob, getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { fmtDate, kstDate, kstDateTime } from '@/lib/time'
import type { Quote, QuoteRequest, Vendor } from '@/lib/types'
import { isUuid } from '@/lib/validate'
import { QUOTE_STATUS, quoteLink, quoteMessage } from '@/lib/vendors'

export const metadata: Metadata = { title: '견적 비교' }

export default async function QuoteRequestPage(props: PageProps<'/admin/vendors/requests/[id]'>) {
  await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  if (!isUuid(id)) notFound()
  const { data } = await db().from('quote_requests').select('*').eq('id', id).maybeSingle()
  const req = data as QuoteRequest | null
  if (!req) notFound()
  const [quotes, vendors, job, settings, origin] = await Promise.all([
    db()
      .from('quotes')
      .select('*')
      .eq('request_id', id)
      .then((r) => (must(r) as Quote[]).filter((q) => q.request_id === id)),
    db()
      .from('vendors')
      .select('*')
      .then((r) => must(r) as Vendor[]),
    req.job_id ? getJob(req.job_id) : null,
    getSettings(),
    siteOrigin(),
  ])
  const vendorOf = new Map(vendors.map((v) => [v.id, v]))
  const today = kstDate()
  const open = req.status === 'open'
  const got = quotes.filter((q) => q.amount != null)
  const low = got.length ? Math.min(...got.map((q) => q.amount!)) : null
  // 비교: 금액 있는 견적을 싼 순서로, 아직 안 온 곳은 뒤에
  const sorted = [...quotes].sort((a, b) => (a.amount ?? Infinity) - (b.amount ?? Infinity))
  const notIn = vendors.filter((v) => v.active && !quotes.some((q) => q.vendor_id === v.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const company = settings.company_name || '해피워크'

  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <Link href="/admin/vendors?tab=quotes" className="text-sm font-semibold text-sub">
        ← 견적 요청 목록
      </Link>
      <section className="card space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-extrabold">{req.title}</h1>
          <span className={`badge shrink-0 ${open ? 'bg-brand-50 text-brand-700' : req.status === 'closed' ? 'bg-ink text-white' : 'bg-gray-100 text-mute'}`}>
            {open ? '견적 받는 중' : req.status === 'closed' ? '마감' : '취소'}
          </span>
        </div>
        <p className="text-sm text-sub">
          {req.due_date ? (
            <>
              견적 마감 <b className={open && req.due_date < today ? 'text-rose-600' : 'text-ink'}>{fmtDate(req.due_date)}</b>
              {open && req.due_date < today && ' (지남)'}
            </>
          ) : (
            '마감일 없음'
          )}
          {job && (
            <>
              {' · '}
              <Link href={`/admin/jobs/${job.id}?tab=pay`} className="underline">
                {job.title}
              </Link>
            </>
          )}
          {' · '}요청 {fmtDate(kstDate(req.created_at))}
        </p>
        {req.details && <p className="rounded-xl bg-bg px-3.5 py-3 text-sm whitespace-pre-wrap">{req.details}</p>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {open ? (
            <>
              <form action={setRequestStatus.bind(null, req.id, 'closed')}>
                <ConfirmSubmit className="chip" confirmText="견적 접수를 마감할까요?">
                  견적 마감
                </ConfirmSubmit>
              </form>
              <form action={setRequestStatus.bind(null, req.id, 'cancelled')}>
                <ConfirmSubmit className="chip" confirmText="이 견적 요청을 취소할까요?">
                  요청 취소
                </ConfirmSubmit>
              </form>
            </>
          ) : (
            !quotes.some((q) => q.status === 'selected') && (
              <form action={setRequestStatus.bind(null, req.id, 'open')}>
                <SubmitButton className="chip" pendingText="…">
                  다시 열기
                </SubmitButton>
              </form>
            )
          )}
        </div>
      </section>

      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-bold">
          견적 비교 <span className="text-sm font-semibold text-mute">받은 견적 {got.length}/{quotes.length}곳</span>
        </h2>
        {low != null && got.length > 1 && <span className="text-sm text-sub">최저 {won(low)}</span>}
      </div>

      {sorted.map((q) => {
        const v = vendorOf.get(q.vendor_id)
        const link = quoteLink(origin, q.token)
        const msg = quoteMessage({ company, vendor: v?.name ?? '', title: req.title, due: req.due_date ? fmtDate(req.due_date) : null, link })
        const st = QUOTE_STATUS[q.status]
        return (
          <div key={q.id} className={`card space-y-3 p-4 ${q.status === 'selected' ? 'ring-2 ring-emerald-300' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/admin/vendors/${q.vendor_id}`} className="font-bold">
                  {v?.name ?? '알 수 없는 업체'}
                </Link>
                <p className="text-xs text-mute">{[v?.category, v?.contact_name].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`badge ${st.cls}`}>{st.label}</span>
                {q.amount != null && q.amount === low && got.length > 1 && <span className="badge bg-emerald-600 text-white">최저가</span>}
              </div>
            </div>
            {q.amount != null ? (
              <div>
                <p className="text-2xl font-extrabold tabular-nums">{won(q.amount)}</p>
                <p className="text-xs text-mute">
                  부가세 {q.vat_included ? '포함' : '별도'} · {q.submitted_by === 'vendor' ? '업체가 직접 입력' : '관리자 기록'}
                  {q.submitted_at && ` · ${kstDateTime(q.submitted_at)}`}
                </p>
                {q.note && <p className="mt-2 rounded-xl bg-bg px-3 py-2 text-sm whitespace-pre-wrap">{q.note}</p>}
              </div>
            ) : (
              <p className="text-sm text-mute">아직 견적이 오지 않았어요.</p>
            )}

            {/* 업체에 링크 보내기 (견적 받는 중) */}
            {open && q.status !== 'selected' && (
              <div className="flex flex-wrap gap-1.5">
                {v?.phone && <GroupContact phones={[v.phone]} label="💬 문자로 요청" body={msg} copy={false} className="chip-primary h-8 px-3 text-xs" />}
                <CopyButton text={msg} label="요청 문구·링크 복사" className="chip h-8 px-3 text-xs" />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {open && q.amount != null && q.status !== 'selected' && (
                <form action={selectQuote.bind(null, q.id)}>
                  <ConfirmSubmit className="chip-primary h-8 px-3 text-xs" confirmText={`${won(q.amount)}로 선정?`}>
                    ✓ 이 업체로 선정
                  </ConfirmSubmit>
                </form>
              )}
              {q.status === 'selected' && (
                <>
                  <Link href="/admin/vendors?tab=pay" className="chip-primary h-8 px-3 text-xs">
                    대금 지급에서 보기 →
                  </Link>
                  <form action={unselectQuote.bind(null, q.id)}>
                    <ConfirmSubmit className="chip h-8 px-3 text-xs" confirmText="선정을 취소할까요?">
                      선정 취소
                    </ConfirmSubmit>
                  </form>
                </>
              )}
            </div>
            {open && q.status !== 'selected' && (
              <Fold title="전화·메일로 받은 견적 기록" summary="업체가 링크를 쓰지 않을 때" className="space-y-3">
                <RecordQuoteForm quoteId={q.id} amount={q.amount} vat={q.vat_included} note={q.note} />
              </Fold>
            )}
          </div>
        )
      })}

      {open && notIn.length > 0 && (
        <Fold title="＋ 업체 더 넣기" summary={`견적을 더 받을 업체 (${notIn.length}곳 중 고르기)`} className="space-y-3">
          <form action={addVendorsToRequest.bind(null, req.id)} className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {notIn.map((v) => (
                <label key={v.id}>
                  <input type="checkbox" name="vendor" value={v.id} className="peer sr-only" />
                  <span className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-sub ring-1 ring-line peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-checked:ring-brand-500">
                    {v.name}
                    {v.category && <span className="text-xs font-medium text-mute">{v.category}</span>}
                  </span>
                </label>
              ))}
            </div>
            <SubmitButton className="btn-soft btn-sm" pendingText="넣는 중…">
              고른 업체 넣기
            </SubmitButton>
          </form>
        </Fold>
      )}
    </div>
  )
}
