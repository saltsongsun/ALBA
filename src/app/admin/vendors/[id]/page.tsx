import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ContactButtons } from '@/components/Contact'
import Flash from '@/components/Flash'
import Fold from '@/components/Fold'
import LiveNumber from '@/components/LiveNumber' // ✏️ 정기 개선 2026-11-28 09:36
import OtherCompanyJob from '@/components/OtherCompanyJob'
import { VendorForm } from '@/components/vendor'
import { rowInMyOtherCompany } from '@/lib/company'
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
  const admin = await requireAdmin()
  const { id } = await props.params
  const sp = await props.searchParams
  if (!isUuid(id)) notFound()
  const { data } = await db().from('vendors').select('*').eq('company_id', admin.companyId).eq('id', id).maybeSingle()
  const v = data as Vendor | null
  if (!v) {
    // 내가 맡은 다른 회사의 외주 업체면: 없는 화면 대신 그 회사로 바꿔서 열기 (정기 개선 2026-11-24 05:35)
    const other = await rowInMyOtherCompany(admin, 'vendors', id)
    if (!other) notFound()
    return (
      <OtherCompanyJob
        title="다른 회사 외주 업체예요"
        company={other}
        now={admin.companyName}
        open={`/admin/vendors/${id}`}
        back={{ href: '/admin/vendors?tab=list', label: '지금 회사 업체 목록으로' }}
      />
    )
  }
  const [quotes, payments] = await Promise.all([
    db()
      .from('quotes')
      .select('id, request_id, amount, status, submitted_at')
      .eq('vendor_id', id)
      .then((r) => must(r) as Pick<Quote, 'id' | 'request_id' | 'amount' | 'status' | 'submitted_at'>[]),
    db()
      .from('vendor_payments')
      .select('*').eq('company_id', admin.companyId)
      .eq('vendor_id', id)
      .then((r) => (must(r) as VendorPayment[]).sort((a, b) => b.created_at.localeCompare(a.created_at))),
  ])
  const reqIds = [...new Set(quotes.map((q) => q.request_id))]
  const requests = reqIds.length
    ? (must(await db().from('quote_requests').select('id, title, created_at').eq('company_id', admin.companyId).in('id', reqIds)) as Pick<QuoteRequest, 'id' | 'title' | 'created_at'>[])
    : []
  const reqOf = new Map(requests.map((r) => [r.id, r]))
  const account = decrypt(v.bank_account_enc)
  const today = kstDate()
  const paid = payments.filter((p) => p.paid_at).reduce((s, p) => s + p.amount, 0)
  const unpaid = payments.filter((p) => !p.paid_at).reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <Link href="/admin/vendors?tab=list" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 업체 목록
      </Link>
      <section className="card space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold">{v.name}</h1>
          {v.user_id && <span className="badge bg-violet-50 text-violet-700">📱 앱 연결 · 견적 요청이 앱으로 가요</span>}
          {v.category && <span className="badge bg-brand-50 text-brand-700">{v.category}</span>}
          {!v.active && <span className="badge bg-gray-100 text-mute">거래 중지</span>}
        </div>
        <p className="text-sm text-sub">
          {[v.contact_name && `담당 ${v.contact_name}`, v.email, v.business_no && `사업자 ${v.business_no}`].filter(Boolean).join(' · ') || '담당자 정보 없음'}
        </p>
        {v.phone && <ContactButtons phone={v.phone} name={v.name} />}
        <p className="text-sm">
          계좌: {account ? `${v.bank_name ?? ''} ${maskAccount(account)} (예금주 ${v.account_holder ?? v.name})` : <span className="text-rose-600">미등록</span>}
          {/* ✏️ 정기 개선 2026-11-28 09:36: 계좌가 없으면 바로 넣으러 가기 (아래 '정보 수정'을 펼치고 테두리 한 번 · 다른 회사에서 가져온 업체는 계좌가 비어 있음) */}
          {!account && (
            <Link href={`/admin/vendors/${v.id}?edit=bank#vendor-edit`} scroll data-vendor-bank-link className="tap ml-1.5 font-semibold whitespace-nowrap text-brand-700">
              계좌 넣기 ›
            </Link>
          )}
        </p>
        <dl className="divide-y divide-line rounded-xl bg-bg px-4 text-sm">
          {/* ✏️ 정기 개선 2026-11-28 09:36: 숫자가 처음 열 때 0에서 올라감 (LiveNumber countUp · 움직임 줄이기면 바로) — 글자와 숫자는 그대로 */}
          {(
            [
              ['받은 견적', quotes.filter((q) => q.amount != null).length, '건'],
              ['지급 완료', paid, '원'],
              ['미지급', unpaid, '원'],
            ] as const
          ).map(([k, n, unit]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-sub">{k}</dt>
              <dd className="font-bold whitespace-nowrap tabular-nums" data-vendor-sum={k}>
                <LiveNumber value={Math.round(n)} countUp />
                {unit}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ✏️ 정기 개선 2026-11-28 09:36: '계좌 넣기 ›'로 오면 펼친 채로 테두리 한 번 (id·open·flash만 더함) */}
      <Fold id="vendor-edit" title="정보 수정" summary="연락처·계좌·메모·거래 여부" open={sp.edit === 'bank'} flash={sp.edit === 'bank'} className="space-y-4">
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
