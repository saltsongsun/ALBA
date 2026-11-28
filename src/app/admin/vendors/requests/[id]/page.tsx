import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addVendorsToRequest, selectQuote, setPaymentDue, setRequestStatus, unselectQuote } from '@/app/actions/vendor' // ✏️ 정기 개선 2026-11-28 11:36: setPaymentDue
import Flash from '@/components/Flash'
import Fold from '@/components/Fold'
import { GroupContact } from '@/components/GroupContact'
import { ConfirmSubmit, CopyButton, SubmitButton } from '@/components/ui'
import { RecordQuoteForm } from '@/components/vendor'
import OtherCompanyJob from '@/components/OtherCompanyJob'
import { rowInMyOtherCompany } from '@/lib/company'
import { getJob, getSettings } from '@/lib/data'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { fmtDate, kstDate, kstDateTime } from '@/lib/time'
import type { Quote, QuoteRequest, Vendor, VendorPayment } from '@/lib/types' // ✏️ 정기 개선 2026-11-28 11:36: VendorPayment
import { isUuid } from '@/lib/validate'
import { lowestQuote, payState, QUOTE_STATUS, quoteLink, quoteMessage, vatTotal } from '@/lib/vendors' // ✏️ 정기 개선 2026-11-28 11:36: payState

export const metadata: Metadata = { title: '견적 비교' }

export default async function QuoteRequestPage(props: PageProps<'/admin/vendors/requests/[id]'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  if (!isUuid(id)) notFound()
  const { data } = await db().from('quote_requests').select('*').eq('company_id', admin.companyId).eq('id', id).maybeSingle()
  const req = data as QuoteRequest | null
  if (!req) {
    // 내가 맡은 다른 회사의 견적 요청이면 (업체가 견적을 냈다는 알림을 눌렀을 때): 그 회사로 바꿔서 열기
    const other = await rowInMyOtherCompany(admin, 'quote_requests', id)
    if (!other) notFound()
    return (
      <OtherCompanyJob
        title="다른 회사 견적 요청이에요"
        company={other}
        now={admin.companyName}
        open={`/admin/vendors/requests/${id}`}
        back={{ href: '/admin/vendors', label: '지금 회사 외주 관리로' }}
      />
    )
  }
  const [quotes, vendors, job, settings, origin] = await Promise.all([
    db()
      .from('quotes')
      .select('*')
      .eq('request_id', id)
      .then((r) => (must(r) as Quote[]).filter((q) => q.request_id === id)),
    db()
      .from('vendors')
      .select('*').eq('company_id', admin.companyId)
      .then((r) => must(r) as Vendor[]),
    req.job_id ? getJob(req.job_id) : null,
    getSettings(admin.companyId),
    siteOrigin(),
  ])
  const vendorOf = new Map(vendors.map((v) => [v.id, v]))
  const today = kstDate()
  const open = req.status === 'open'
  // ✏️ 정기 개선 2026-11-28 11:36: 선정한 견적으로 만든 대금 지급 건 (이 회사 것만) — 선정 카드에서 지급 상태·지급 예정일을 바로 보고 정함
  const pickedQ = quotes.find((q) => q.status === 'selected')
  const pickedPay = pickedQ
    ? (
        (must(
          await db().from('vendor_payments').select('id, company_id, quote_id, due_date, paid_at').eq('company_id', admin.companyId).eq('quote_id', pickedQ.id),
        ) as Pick<VendorPayment, 'id' | 'company_id' | 'quote_id' | 'due_date' | 'paid_at'>[]).filter((p) => p.company_id === admin.companyId && p.quote_id === pickedQ.id)
      )[0] ?? null
    : null
  const got = quotes.filter((q) => q.amount != null)
  // 비교는 부가세 포함 금액으로 (포함·별도가 섞여 있으면 적힌 숫자만으로는 어느 쪽이 싼지 뒤바뀔 수 있음)
  const { low, mixed } = lowestQuote(quotes)
  // 금액 있는 견적을 싼 순서로, 아직 안 온 곳은 뒤에
  const sorted = [...quotes].sort((a, b) => (vatTotal(a) ?? Infinity) - (vatTotal(b) ?? Infinity))
  const notIn = vendors.filter((v) => v.active && !quotes.some((q) => q.vendor_id === v.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const company = settings.company_name || '해피워크'

  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <Link href="/admin/vendors?tab=quotes" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
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
        {low != null && got.length > 1 && (
          <span className="shrink-0 text-sm whitespace-nowrap text-sub" data-quote-low>
            최저 {won(low)}
          </span>
        )}
      </div>
      {/* ✏️ 정기 개선 2026-11-28 05:36: 받은 견적 n/m곳을 얇은 막대로 (0.25초 채워짐 · 다 받으면 초록 · 움직임 줄이기면 없음) */}
      {quotes.length > 0 && (
        <div className="-mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden data-quote-progress={`${got.length}/${quotes.length}`}>
          <span
            className={`block h-full origin-left animate-[grow_0.25s_ease-out_both] rounded-full motion-reduce:animate-none ${got.length === quotes.length ? 'bg-emerald-500' : 'bg-brand-500'}`}
            style={{ width: `${Math.round((got.length / quotes.length) * 100)}%` }}
          />
        </div>
      )}
      {mixed && (
        <p className="-mt-2 text-xs text-mute" data-quote-vat-mixed>
          부가세 포함·별도가 섞여 있어 <b className="font-semibold text-sub">부가세 포함 금액</b>으로 견줬어요.
        </p>
      )}

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
                {q.amount != null && vatTotal(q) === low && got.length > 1 && (
                  <span className="badge bg-emerald-600 text-white" data-quote-lowest>
                    최저가
                  </span>
                )}
              </div>
            </div>
            {q.amount != null ? (
              <div>
                <p className="text-2xl font-extrabold tabular-nums">{won(q.amount)}</p>
                {/* 부가세 별도 견적: 실제로 나갈 금액을 바로 아래에 (다른 견적과 같은 기준으로 보이게) */}
                {!q.vat_included && (
                  <p className="text-sm font-semibold text-amber-700" data-quote-vat-total>
                    부가세 더하면 <span className="whitespace-nowrap tabular-nums">{won(vatTotal(q))}</span>
                  </p>
                )}
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
                  <ConfirmSubmit className="chip-primary h-8 px-3 text-xs" confirmText={`${won(q.amount)}${q.vat_included ? '' : ' (부가세 별도)'}로 선정?`}>
                    ✓ 이 업체로 선정
                  </ConfirmSubmit>
                </form>
              )}
              {q.status === 'selected' && (
                <>
                  {/* ✏️ 정기 개선 2026-11-28 11:36: 대금 지급 탭의 바로 그 지급 건으로 (테두리 표시) — 지급 건이 없으면 전처럼 탭으로 */}
                  <Link href={pickedPay ? `/admin/vendors?tab=pay${pickedPay.paid_at ? '&show=all' : ''}#pay-${pickedPay.id}` : '/admin/vendors?tab=pay'} className="chip-primary h-8 px-3 text-xs" data-quote-pay-link>
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
            {/* ✏️ 정기 개선 2026-11-28 11:36: 선정한 견적의 대금 — 상태 한 줄 + 지급 예정일 바로 정하기 (대금 지급 탭과 같은 저장) · 저장하면 날짜 줄이 짧게 톡 */}
            {q.status === 'selected' && pickedPay && (
              <div data-quote-pay className="space-y-2 rounded-xl px-3 py-2.5 text-sm ring-1 ring-line">
                <p key={`${pickedPay.due_date ?? ''}-${pickedPay.paid_at ?? ''}`} className="flex flex-wrap items-center gap-1.5 animate-[pop_0.25s_ease-out_both] motion-reduce:animate-none" data-quote-pay-state>
                  <span className={`badge ${payState(pickedPay, today).cls}`}>{payState(pickedPay, today).label}</span>
                  {/* 배지가 상태를 말하니 옆에는 날짜만 (같은 말 반복 안 함) */}
                  {pickedPay.paid_at ? (
                    <span className="text-mute">{fmtDate(pickedPay.paid_at)}</span>
                  ) : pickedPay.due_date ? (
                    <span className="font-semibold text-sub">{fmtDate(pickedPay.due_date)}</span>
                  ) : (
                    <span className="text-amber-700">날짜 없음</span>
                  )}
                </p>
                {!pickedPay.paid_at && (
                  <form action={setPaymentDue.bind(null, pickedPay.id)} className="flex items-center gap-1.5">
                    <input type="date" name="due_date" defaultValue={pickedPay.due_date ?? ''} className="input h-8 w-36 py-0 text-xs" aria-label="지급 예정일" />
                    <SubmitButton className="chip h-8 px-2.5 text-xs" pendingText="…">
                      {pickedPay.due_date ? '날짜 바꾸기' : '날짜 저장'}
                    </SubmitButton>
                  </form>
                )}
              </div>
            )}
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
