import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ContactButtons } from '@/components/Contact'
import Flash from '@/components/Flash'
import Fold from '@/components/Fold'
import { VendorForm } from '@/components/vendor'
import { decrypt } from '@/lib/crypto'
import { db, must } from '@/lib/db'
import { maskAccount, won } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { fmtDate, kstDate } from '@/lib/time'
import type { Quote, QuoteRequest, Vendor, VendorPayment } from '@/lib/types'
import { isUuid } from '@/lib/validate'
import { payState, QUOTE_STATUS } from '@/lib/vendors'

export const metadata: Metadata = { title: '외주사 정보' }

export default async function VendorPage(props: PageProps<'/admin/vendors/[id]'>) {
  await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  if (!isUuid(id)) notFound()
  const { data } = await db().from('vendors').select('*').eq('id', id).maybeSingle()
  const v = data as Vendor | null
  if (!v) notFound()
  const [quotes, payments] = await Promise.all([
    db()
      .from('quotes')
      .select('id, request_id, amount, status, submitted_at')
      .eq('vendor_id', id)
      .then((r) => must(r) as Pick<Quote, 'id' | 'request_id' | 'amount' | 'status' | 'submitted_at'>[]),
    db()
      .from('vendor_payments')
      .select('*')
      .eq('vendor_id', id)
      .then((r) => (must(r) as VendorPayment[]).sort((a, b) => b.created_at.localeCompare(a.created_at))),
  ])
  const reqIds = [...new Set(quotes.map((q) => q.request_id))]
  const requests = reqIds.length
    ? (must(await db().from('quote_requests').select('id, title, created_at').in('id', reqIds)) as Pick<QuoteRequest, 'id' | 'title' | 'created_at'>[])
    : []
  const reqOf = new Map(requests.map((r) => [r.id, r]))
  const account = decrypt(v.bank_account_enc)
  const today = kstDate()
  const paid = payments.filter((p) => p.paid_at).reduce((s, p) => s + p.amount, 0)
  const unpaid = payments.filter((p) => !p.paid_at).reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <Link href="/admin/vendors?tab=list" className="text-sm font-semibold text-sub">
        ← 업체 목록
      </Link>
      <section className="card space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold">{v.name}</h1>
          {v.category && <span className="badge bg-brand-50 text-brand-700">{v.category}</span>}
          {!v.active && <span className="badge bg-gray-100 text-mute">거래 중지</span>}
        </div>
        <p className="text-sm text-sub">
          {[v.contact_name && `담당 ${v.contact_name}`, v.email, v.business_no && `사업자 ${v.business_no}`].filter(Boolean).join(' · ') || '담당자 정보 없음'}
        </p>
        {v.phone && <ContactButtons phone={v.phone} name={v.name} />}
        <p className="text-sm">
          계좌: {account ? `${v.bank_name ?? ''} ${maskAccount(account)} (예금주 ${v.account_holder ?? v.name})` : <span className="text-rose-600">미등록</span>}
        </p>
        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          {(
            [
              ['견적', `${quotes.filter((q) => q.amount != null).length}건`],
              ['지급 완료', won(paid)],
              ['미지급', won(unpaid)],
            ] as const
          ).map(([k, val]) => (
            <div key={k} className="rounded-xl bg-bg px-2 py-2.5">
              <p className="text-xs text-mute">{k}</p>
              <p className="font-bold tabular-nums">{val}</p>
            </div>
          ))}
        </div>
      </section>

      <Fold title="정보 수정" summary="연락처·계좌·메모·거래 여부" className="space-y-4">
        <VendorForm
          id={v.id}
          initial={{
            name: v.name,
            category: v.category,
            contact_name: v.contact_name,
            phone: v.phone,
            email: v.email,
            business_no: v.business_no,
            bank_name: v.bank_name,
            account_masked: account ? maskAccount(account) : null,
            account_holder: v.account_holder,
            memo: v.memo,
            active: v.active,
          }}
        />
      </Fold>

      <section className="space-y-2">
        <h2 className="section-title">대금 지급</h2>
        {payments.length === 0 ? (
          <p className="card py-6 text-center text-sm text-mute">지급 내역이 없어요.</p>
        ) : (
          <div className="card divide-y divide-line py-1">
            {payments.map((p) => {
              const st = payState(p, today)
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.title}</p>
                    <p className="text-xs text-mute">
                      {p.paid_at ? `${fmtDate(p.paid_at)} 지급` : p.due_date ? `지급 예정 ${fmtDate(p.due_date)}` : '지급 예정일 없음'}
                      {p.invoice_at ? ' · 계산서 받음' : ' · 계산서 안 받음'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums">{won(p.amount)}</p>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="section-title">견적 이력</h2>
        {quotes.length === 0 ? (
          <p className="card py-6 text-center text-sm text-mute">견적 요청 이력이 없어요.</p>
        ) : (
          <div className="card divide-y divide-line py-1">
            {quotes
              .sort((a, b) => (reqOf.get(b.request_id)?.created_at ?? '').localeCompare(reqOf.get(a.request_id)?.created_at ?? ''))
              .map((q) => (
                <Link key={q.id} href={`/admin/vendors/requests/${q.request_id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{reqOf.get(q.request_id)?.title ?? '견적 요청'}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {q.amount != null && <b className="tabular-nums">{won(q.amount)}</b>}
                    <span className={`badge ${QUOTE_STATUS[q.status].cls}`}>{QUOTE_STATUS[q.status].label}</span>
                  </span>
                </Link>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}
