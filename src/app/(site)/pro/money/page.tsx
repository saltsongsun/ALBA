import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import ProMode from '@/components/ProMode'
import { phoneFmt, won, wonReadable } from '@/lib/format'
import { partnerCompanies, partnerPayments, partnerQuotes, type PartnerQuote } from '@/lib/partners'
import { PartnerShareCard } from '@/components/pro'
import { requireUser } from '@/lib/session'
import { fmtDate, kstDate } from '@/lib/time'
import { DUE_TONE, payDue } from '@/lib/due'

export const metadata: Metadata = { title: '견적 · 대금' }

const QUOTE_STATE: Record<PartnerQuote['status'], { label: string; cls: string }> = {
  requested: { label: '견적 대기', cls: 'bg-amber-50 text-amber-700' },
  submitted: { label: '견적 보냄', cls: 'bg-brand-50 text-brand-700' },
  selected: { label: '선정됨', cls: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '미선정', cls: 'bg-gray-100 text-mute' },
}

/** 전문가·외주 업체: 여러 회사에서 받은 견적 요청과 대금(지급 예정일·세금계산서·지급 완료)을 한곳에서 */
export default async function ProMoney(props: PageProps<'/pro/money'>) {
  const user = await requireUser('/pro/money')
  const sp = await props.searchParams
  const today = kstDate()
  const [allQuotes, allPays] = await Promise.all([partnerQuotes(user.id), partnerPayments(user.id)])
  // 거래하는 회사 (견적을 요청했거나 대금이 있는 곳) — 두 곳 이상이면 회사별로 골라 볼 수 있게. 받을 대금이 큰 순서
  const firms = new Map<string, { id: string; name: string; unpaid: number }>()
  for (const q of allQuotes) if (q.request) firms.set(q.request.company_id, { id: q.request.company_id, name: q.company, unpaid: 0 })
  for (const p of allPays) {
    const f = firms.get(p.company_id) ?? { id: p.company_id, name: p.company, unpaid: 0 }
    if (!p.paid_at) f.unpaid += p.amount
    firms.set(p.company_id, f)
  }
  const firmList = [...firms.values()].sort((a, b) => b.unpaid - a.unpaid || a.name.localeCompare(b.name, 'ko'))
  // 고른 회사 (내가 거래하는 회사일 때만 — 아니면 전체)
  const co = typeof sp.co === 'string' && firms.has(sp.co) ? sp.co : null
  const quotes = co ? allQuotes.filter((q) => q.request?.company_id === co) : allQuotes
  const pays = co ? allPays.filter((p) => p.company_id === co) : allPays
  const unpaid = pays.filter((p) => !p.paid_at)
  const paid = pays.filter((p) => p.paid_at)
  const sum = (list: typeof pays) => list.reduce((n, p) => n + p.amount, 0)
  // 지급일이 지났는데 아직 못 받은 대금 (받을 대금 칸에 한 줄로)
  const late = unpaid.filter((p) => payDue(p.due_date, p.paid_at, today).tone === 'late')
  // 견적·대금이 하나도 없으면: 나를 외주사로 등록해 둔 회사가 있는지 (없으면 회사에 알려 줄 번호를 보여 줌)
  const linked = allQuotes.length === 0 && allPays.length === 0 ? await partnerCompanies(user.id) : []
  return (
    <div className="space-y-5" data-mode="pro">
      <ProMode />
      <div>
        <h1 className="text-2xl font-extrabold">견적 · 대금</h1>
        <p className="mt-1 text-sm text-sub">여러 회사에서 받은 견적 요청과 대금을 한곳에서 봐요.</p>
      </div>

      {/* 견적도 대금도 아직 없으면: 0원 칸 두 개와 빈 칸 두 개 대신 안내 하나만 (같은 '아직 없어요'를 여러 번 보이지 않게) */}
      {firmList.length > 1 && (
        <nav className="fade-x -mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="회사별로 보기" data-pro-firms>
          <Link href="/pro/money" scroll={false} className={`chip ${co ? '' : 'bg-ink text-white ring-0 hover:bg-ink'}`} aria-current={co ? undefined : 'true'}>
            전체
          </Link>
          {firmList.map((f) => (
            <Link
              key={f.id}
              href={`/pro/money?co=${f.id}`}
              scroll={false}
              className={`chip ${co === f.id ? 'bg-ink text-white ring-0 hover:bg-ink' : ''}`}
              aria-current={co === f.id ? 'true' : undefined}
              data-pro-firm={f.id}
            >
              <span className="max-w-[9.5rem] truncate">{f.name || '회사'}</span>
              {f.unpaid > 0 && <span className={`text-xs font-medium ${co === f.id ? 'text-white/75' : 'text-mute'}`}>받을 {wonReadable(f.unpaid)}</span>}
            </Link>
          ))}
        </nav>
      )}

      {quotes.length === 0 && pays.length === 0 ? (
        <div data-pro-money-empty>
          {linked.length === 0 ? (
            <PartnerShareCard name={user.name} phone={phoneFmt(user.phone)} title="아직 받은 견적·대금이 없어요" />
          ) : (
            <Empty icon="📄" title="아직 받은 견적·대금이 없어요">
              <span className="block" data-partner-linked={linked.length}>
                {linked.length}개 회사에 외주사로 등록돼 있어요 · {linked.slice(0, 3).join(', ')}
                {linked.length > 3 && ` 외 ${linked.length - 3}곳`}
              </span>
              견적을 요청하면 여기로 와요. 선정되면 대금도 지급 예정일과 함께 보여요.
            </Empty>
          )}
        </div>
      ) : (
      <>
      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-brand-50 px-4 py-3">
          <p className="text-xs font-semibold text-brand-700">받을 대금 {unpaid.length}건</p>
          <p className="text-lg font-extrabold whitespace-nowrap text-brand-700 tabular-nums">{won(sum(unpaid))}</p>
          {late.length > 0 && (
            <p className="text-xs font-semibold whitespace-nowrap text-rose-600" data-pay-late>
              지급일 지난 {late.length}건
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
          <p className="text-xs font-semibold text-mute">받은 대금 {paid.length}건</p>
          <p className="text-lg font-extrabold whitespace-nowrap tabular-nums">{won(sum(paid))}</p>
        </div>
      </section>

      <section>
        <h2 className="section-title">📄 견적 요청 {quotes.length > 0 && <span className="text-brand-600">{quotes.length}</span>}</h2>
        {quotes.length === 0 ? (
          <Empty icon="📄" title="받은 견적 요청이 없어요">
            새 견적 요청이 오면 여기와 휴대폰 알림으로 알려 드려요.
          </Empty>
        ) : (
          <div className="card divide-y divide-line py-1">
            {quotes.map((q) => {
              const st = QUOTE_STATE[q.status]
              const open = q.request?.status === 'open' && (q.status === 'requested' || q.status === 'submitted')
              const late = open && q.request?.due_date && q.request.due_date < today
              return (
                <Link key={q.id} href={`/quote/${q.token}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-mute">{q.company}</span>
                    <span className="block font-semibold">{q.request?.title}</span>
                    <span className="block text-xs text-sub">
                      {q.amount != null ? `${won(q.amount)} (${q.vat_included ? '부가세 포함' : '부가세 별도'})` : '아직 금액을 안 보냈어요'}
                      {q.request?.due_date && <span className={late ? 'text-rose-600' : ''}> · 마감 {fmtDate(q.request.due_date)}</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`badge ${st.cls}`}>{q.request?.status === 'open' || q.status === 'selected' ? st.label : '마감'}</span>
                    {open && <span className="text-xs font-bold whitespace-nowrap text-brand-600">{q.status === 'submitted' ? '고치기 →' : '견적 내기 →'}</span>}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section id="pay" className="scroll-mt-20">
        <h2 className="section-title">💸 대금</h2>
        {pays.length === 0 ? (
          <Empty icon="💸" title="아직 대금 내역이 없어요">
            견적이 선정되면 지급 예정일과 함께 여기에 보여요.
          </Empty>
        ) : (
          <div className="card divide-y divide-line py-1">
            {pays.map((p) => {
              // 지급 완료 · n일 지남 · 오늘 지급 · D-n · 협의 중 (짧은 배지 하나로)
              const due = payDue(p.due_date, p.paid_at, today)
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3" data-pay-row={p.title}>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-mute">{p.company}</span>
                    <span className="block truncate font-semibold">{p.title}</span>
                    {/* 날짜 한 줄 · 계산서 한 줄 (한 줄에 이어 쓰면 360px에서 '필요'만 아래로 떨어져서) */}
                    <span className={`block truncate text-xs ${due.tone === 'late' ? 'font-semibold text-rose-600' : 'text-sub'}`}>
                      {p.paid_at ? `받은 날 ${fmtDate(p.paid_at.slice(0, 10))}` : p.due_date ? `지급 예정 ${fmtDate(p.due_date)}` : '지급일 협의 중'}
                    </span>
                    <span className={`block truncate text-xs ${p.invoice_at ? 'text-mute' : 'text-amber-700'}`} data-invoice={p.invoice_at ? 'in' : 'need'}>
                      {p.invoice_at ? '세금계산서 접수됨' : '세금계산서 발행 필요'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-extrabold whitespace-nowrap tabular-nums">{won(p.amount)}</span>
                    <span className={`badge tabular-nums ${DUE_TONE[due.tone]}`} data-pay-due={due.tone}>
                      {due.label}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
      </>
      )}

      {user.memberType === 'expert' && (
        <Link href="/me/history" className="card-link flex items-center justify-between p-4 text-sm font-semibold">
          <span>🧾 전문가 의뢰로 일한 대금 (지급명세서)</span>
          <span className="text-brand-600">보기 →</span>
        </Link>
      )}
    </div>
  )
}
