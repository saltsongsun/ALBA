import type { Metadata } from 'next'
import Link from 'next/link'
import { deletePayment, markInvoice, markVendorPaid, setPaymentDue } from '@/app/actions/vendor'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import Fold from '@/components/Fold'
import { ConfirmSubmit, CopyButton, SubmitButton } from '@/components/ui'
import { PaymentForm, QuoteRequestForm, VendorForm } from '@/components/vendor'
import { decrypt } from '@/lib/crypto'
import { db, must } from '@/lib/db'
import { maskAccount, won } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { fmtDate, kstDate } from '@/lib/time'
import type { Job, Quote, QuoteRequest, Vendor, VendorPayment } from '@/lib/types'
import { isUuid } from '@/lib/validate'
import { payState } from '@/lib/vendors'

export const metadata: Metadata = { title: '외주 관리' }

const TABS = [
  ['quotes', '견적 요청'],
  ['pay', '대금 지급'],
  ['list', '업체'],
] as const

export default async function VendorsPage(props: PageProps<'/admin/vendors'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'quotes'
  const show = sp.show === 'paid' ? 'paid' : sp.show === 'all' ? 'all' : 'unpaid'
  const presetJob = typeof sp.job === 'string' && isUuid(sp.job) ? sp.job : ''
  const today = kstDate()
  const [vendors, requests, quotes, payments, jobs] = await Promise.all([
    db()
      .from('vendors')
      .select('*')
      .then((r) => (must(r) as Vendor[]).sort((a, b) => a.name.localeCompare(b.name, 'ko'))),
    db()
      .from('quote_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then((r) => (must(r) as QuoteRequest[]).sort((a, b) => b.created_at.localeCompare(a.created_at))),
    db()
      .from('quotes')
      .select('id, request_id, vendor_id, amount, status')
      .then((r) => must(r) as Pick<Quote, 'id' | 'request_id' | 'vendor_id' | 'amount' | 'status'>[]),
    db()
      .from('vendor_payments')
      .select('*')
      .then((r) => must(r) as VendorPayment[]),
    // 연결할 공고: 최근 끝났거나 앞으로 있을 공고
    db()
      .from('jobs')
      .select('id, title, start_date, end_date, status')
      .gte('end_date', kstDate(new Date(Date.now() - 90 * 86_400_000)))
      .order('start_date', { ascending: false })
      .limit(200)
      .then((r) => (must(r) as Pick<Job, 'id' | 'title' | 'start_date' | 'end_date' | 'status'>[]).filter((j) => j.status !== 'draft')),
  ])
  const vendorOf = new Map(vendors.map((v) => [v.id, v]))
  const jobOf = new Map(jobs.map((j) => [j.id, j]))
  const jobOpts = jobs.map((j) => ({ id: j.id, label: `${fmtDate(j.start_date)} · ${j.title}` }))
  const activeVendors = vendors.filter((v) => v.active)

  // 지급 목록: 지급일 지난 것 → 곧 → 예정(날짜순, 날짜 없는 건 뒤) → 지급 완료(최근 순)
  const rank = { overdue: 0, soon: 1, planned: 2, paid: 3 }
  const payRows = payments
    .map((p) => ({ p, st: payState(p, today) }))
    .filter(({ st }) => (show === 'unpaid' ? st.key !== 'paid' : show === 'paid' ? st.key === 'paid' : true))
    .sort(
      (a, b) =>
        rank[a.st.key] - rank[b.st.key] ||
        (a.st.key === 'paid' ? (b.p.paid_at ?? '').localeCompare(a.p.paid_at ?? '') : (a.p.due_date ?? '9999').localeCompare(b.p.due_date ?? '9999')),
    )
  const unpaid = payments.filter((p) => !p.paid_at)
  const overdue = unpaid.filter((p) => p.due_date && p.due_date < today)
  const noInvoice = payments.filter((p) => !p.invoice_at)
  const openRequests = requests.filter((r) => r.status === 'open')

  return (
    <div className="space-y-5">
      <Flash m={sp.m} />
      <div>
        <h1 className="text-2xl font-extrabold">외주 관리</h1>
        <p className="mt-1 text-sm text-sub">협력업체에 견적을 요청해 비교하고, 선정한 업체의 대금 지급·세금계산서를 관리해요.</p>
      </div>

      {/* 한눈에: 진행 중인 견적 · 지급할 돈 · 지급일 지남 · 계산서 안 받음 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['진행 중 견적', `${openRequests.length}건`, '/admin/vendors?tab=quotes', 'text-brand-700'],
            ['지급할 금액', won(unpaid.reduce((s, p) => s + p.amount, 0)), '/admin/vendors?tab=pay', 'text-ink'],
            ['지급일 지남', `${overdue.length}건`, '/admin/vendors?tab=pay', overdue.length ? 'text-rose-600' : 'text-mute'],
            ['계산서 안 받음', `${noInvoice.length}건`, '/admin/vendors?tab=pay&show=all', noInvoice.length ? 'text-amber-700' : 'text-mute'],
          ] as const
        ).map(([k, v, href, tone]) => (
          <Link key={k} href={href} className="card-link p-3.5">
            <p className="text-xs font-semibold text-mute">{k}</p>
            <p className={`mt-0.5 text-lg font-extrabold tabular-nums ${tone}`}>{v}</p>
          </Link>
        ))}
      </div>

      <div className="flex border-b border-line">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/vendors?tab=${k}`}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-bold transition ${tab === k ? 'border-ink text-ink' : 'border-transparent text-mute'}`}
          >
            {label}
            {k === 'pay' && overdue.length > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{overdue.length}</span>}
          </Link>
        ))}
      </div>

      {tab === 'quotes' && (
        <div className="space-y-3">
          <Fold title="＋ 새 견적 요청" summary="여러 업체에 같은 내용으로 견적을 받아 비교해요" open={!!presetJob || requests.length === 0} className="space-y-4">
            <QuoteRequestForm
              vendors={activeVendors.map((v) => ({ id: v.id, label: v.name, category: v.category }))}
              jobs={jobOpts}
              jobId={presetJob}
            />
          </Fold>
          {requests.length === 0 ? (
            <Empty icon="📄" title="아직 견적 요청이 없어요">
              위에서 업체를 골라 견적을 요청해 보세요.
            </Empty>
          ) : (
            [...openRequests, ...requests.filter((r) => r.status !== 'open')].map((r) => {
              const qs = quotes.filter((q) => q.request_id === r.id)
              const got = qs.filter((q) => q.amount != null)
              const low = got.length ? Math.min(...got.map((q) => q.amount!)) : null
              const picked = qs.find((q) => q.status === 'selected')
              const late = r.status === 'open' && r.due_date && r.due_date < today
              return (
                <Link key={r.id} href={`/admin/vendors/requests/${r.id}`} className="card-link block space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-bold">{r.title}</p>
                    <span
                      className={`badge shrink-0 ${
                        r.status === 'open' ? (late ? 'bg-amber-100 text-amber-800' : 'bg-brand-50 text-brand-700') : r.status === 'closed' ? 'bg-ink text-white' : 'bg-gray-100 text-mute'
                      }`}
                    >
                      {r.status === 'open' ? (late ? '마감일 지남' : '견적 받는 중') : r.status === 'closed' ? (picked ? '선정 완료' : '마감') : '취소'}
                    </span>
                  </div>
                  <p className="text-sm text-sub">
                    받은 견적 <b className="text-ink">{got.length}</b>/{qs.length}곳
                    {low != null && <> · 최저 {won(low)}</>}
                    {picked && <> · 선정 {vendorOf.get(picked.vendor_id)?.name} {won(picked.amount)}</>}
                  </p>
                  <p className="text-xs text-mute">
                    {r.due_date ? `마감 ${fmtDate(r.due_date)}` : '마감일 없음'}
                    {r.job_id && jobOf.get(r.job_id) && ` · ${jobOf.get(r.job_id)!.title}`}
                  </p>
                </Link>
              )
            })
          )}
        </div>
      )}

      {tab === 'pay' && (
        <div className="space-y-3">
          <Fold title="＋ 지급 건 등록" summary="견적 없이 바로 등록할 때 (선정한 견적은 자동으로 올라와요)" open={!!presetJob} className="space-y-4">
            {activeVendors.length === 0 ? (
              <p className="text-sm text-mute">먼저 ‘업체’ 탭에서 외주사를 등록해 주세요.</p>
            ) : (
              <PaymentForm
                vendors={activeVendors.map((v) => ({ id: v.id, label: v.name }))}
                jobs={jobOpts}
                initial={presetJob ? { vendor_id: '', job_id: presetJob, title: '', amount: 0, vat_included: true, due_date: null, memo: null } : undefined}
              />
            )}
          </Fold>
          <div className="flex gap-1.5">
            {(
              [
                ['unpaid', `지급 전 ${unpaid.length}`],
                ['paid', '지급 완료'],
                ['all', '전체'],
              ] as const
            ).map(([k, label]) => (
              <Link
                key={k}
                href={`/admin/vendors?tab=pay${k === 'unpaid' ? '' : `&show=${k}`}`}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ${show === k ? 'bg-ink text-white ring-ink' : 'bg-white text-sub ring-line'}`}
              >
                {label}
              </Link>
            ))}
          </div>
          {payRows.length === 0 ? (
            <Empty icon="💸" title={show === 'unpaid' ? '지급할 대금이 없어요' : '지급 내역이 없어요'}>
              견적을 선정하거나 위에서 직접 등록하면 여기에 올라와요.
            </Empty>
          ) : (
            payRows.map(({ p, st }) => {
              const v = vendorOf.get(p.vendor_id)
              const account = v ? decrypt(v.bank_account_enc) : null
              const job = p.job_id ? jobOf.get(p.job_id) : null
              return (
                <div key={p.id} className={`card space-y-2.5 p-4 ${st.key === 'overdue' ? 'ring-2 ring-rose-200' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/admin/vendors/${p.vendor_id}`} className="font-bold">
                        {v?.name ?? '알 수 없는 업체'}
                      </Link>
                      <p className="text-sm text-sub">{p.title}</p>
                      {job && (
                        <Link href={`/admin/jobs/${job.id}?tab=pay`} className="text-xs text-mute underline">
                          {job.title}
                        </Link>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-extrabold tabular-nums">{won(p.amount)}</p>
                      <p className="text-[11px] text-mute">부가세 {p.vat_included ? '포함' : '별도'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    {p.paid_at ? <span className="text-mute">{fmtDate(p.paid_at)} 지급</span> : p.due_date ? <span className="text-sub">지급 예정 {fmtDate(p.due_date)}</span> : <span className="text-amber-700">지급 예정일 없음</span>}
                    {p.invoice_at ? (
                      <span className="badge bg-emerald-50 text-emerald-700">계산서 받음 {fmtDate(p.invoice_at)}</span>
                    ) : (
                      <span className="badge bg-amber-50 text-amber-700">계산서 안 받음</span>
                    )}
                  </div>
                  {!p.paid_at && account && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 text-sub">
                        {v?.bank_name} {maskAccount(account)} · {v?.account_holder ?? v?.name}
                      </span>
                      <CopyButton text={`${v?.bank_name ?? ''} ${account} ${v?.account_holder ?? v?.name ?? ''}`.trim()} label="계좌 복사" className="chip h-8 px-3 text-xs" />
                    </div>
                  )}
                  {!p.paid_at && !account && <p className="text-xs text-rose-600">계좌가 등록되지 않았어요 · 업체 정보에서 등록해 주세요.</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!p.paid_at && (
                      <form action={setPaymentDue.bind(null, p.id)} className="flex items-center gap-1">
                        <input type="date" name="due_date" defaultValue={p.due_date ?? ''} className="input h-8 w-36 py-0 text-xs" aria-label="지급 예정일" />
                        <SubmitButton className="chip h-8 px-2.5 text-xs" pendingText="…">
                          날짜 저장
                        </SubmitButton>
                      </form>
                    )}
                    <form action={markInvoice.bind(null, p.id, !p.invoice_at)}>
                      <SubmitButton className="chip h-8 px-2.5 text-xs" pendingText="…">
                        {p.invoice_at ? '계산서 취소' : '🧾 계산서 받음'}
                      </SubmitButton>
                    </form>
                    <form action={markVendorPaid.bind(null, p.id, !p.paid_at)}>
                      {p.paid_at ? (
                        <ConfirmSubmit className="chip h-8 px-2.5 text-xs" confirmText="지급 완료를 취소할까요?">
                          지급 취소
                        </ConfirmSubmit>
                      ) : (
                        <ConfirmSubmit className="chip-primary h-8 px-2.5 text-xs" confirmText={`${won(p.amount)} 지급 완료?`}>
                          💸 지급 완료
                        </ConfirmSubmit>
                      )}
                    </form>
                    {!p.paid_at && (
                      <form action={deletePayment.bind(null, p.id)} className="ml-auto">
                        <ConfirmSubmit className="h-8 px-2 text-xs font-semibold text-mute" confirmText="지울까요?">
                          지우기
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'list' && (
        <div className="space-y-3">
          <Fold title="＋ 외주사 등록" summary="상호·분야·담당자·연락처·대금 받을 계좌" open={vendors.length === 0} className="space-y-4">
            <VendorForm />
          </Fold>
          {vendors.length === 0 ? (
            <Empty icon="🏢" title="등록된 외주사가 없어요">
              위에서 자주 일을 맡기는 업체를 등록해 두세요.
            </Empty>
          ) : (
            vendors.map((v) => {
              const vq = quotes.filter((q) => q.vendor_id === v.id)
              const vp = payments.filter((p) => p.vendor_id === v.id)
              const due = vp.filter((p) => !p.paid_at).reduce((s, p) => s + p.amount, 0)
              return (
                <div key={v.id} className={`card space-y-2 p-4 ${v.active ? '' : 'opacity-60'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/vendors/${v.id}`} className="min-w-0">
                      <p className="font-bold">
                        {v.name} {!v.active && <span className="badge bg-gray-100 text-mute">거래 중지</span>}
                      </p>
                      <p className="text-sm text-sub">
                        {[v.category, v.contact_name].filter(Boolean).join(' · ') || '분야·담당자 없음'}
                      </p>
                    </Link>
                    <Link href={`/admin/vendors/${v.id}`} className="shrink-0 text-sm font-semibold text-brand-600">
                      정보 →
                    </Link>
                  </div>
                  <p className="text-xs text-mute">
                    견적 {vq.filter((q) => q.amount != null).length}건 · 선정 {vq.filter((q) => q.status === 'selected').length}건 · 지급 {won(vp.filter((p) => p.paid_at).reduce((s, p) => s + p.amount, 0))}
                    {due > 0 && <b className="text-amber-700"> · 미지급 {won(due)}</b>}
                  </p>
                  {v.phone && <ContactButtons phone={v.phone} name={v.contact_name ? `${v.name} ${v.contact_name}` : v.name} />}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
