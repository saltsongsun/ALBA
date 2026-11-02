'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { encrypt } from '@/lib/crypto'
import { audit } from '@/lib/data'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { adminIds, sendPush } from '@/lib/push'
import { caughtByHoneypot, ipKey, overLimit } from '@/lib/ratelimit'
import { requireAdmin, type AdminUser } from '@/lib/session'
import { companyJob, companyRow } from '@/lib/company'
import { findPartnerAccount, tellPartner } from '@/lib/partners'
import { siteOrigin } from '@/lib/session'
import { kstDate } from '@/lib/time'
import type { Quote, QuoteRequest, Vendor, VendorPayment } from '@/lib/types'
import { isDate, isUuid, line, optLine, optStr, str } from '@/lib/validate'
import type { FormState } from './auth'

function back(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}m=${encodeURIComponent(msg)}`)
}

/** 금액 칸: 쉼표·원·공백을 빼고 숫자만 (0 ~ 1천억) */
function amountOf(form: FormData, key = 'amount'): number | null {
  const raw = str(form, key, 30).replace(/[^\d]/g, '')
  if (!raw) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n <= 100_000_000_000 ? n : null
}

const dateOrNull = (form: FormData, key: string) => {
  const v = str(form, key, 10)
  return isDate(v) ? v : null
}

const newToken = () => randomBytes(24).toString('base64url')

/** 견적 요청을 앱에 가입한 업체·전문가에게 알림 (그 사람의 견적 입력 화면으로) */
async function askPartner(admin: AdminUser, vendorId: string, token: string, title: string, due: string | null, jobId: string | null) {
  await tellPartner(vendorId, {
    companyId: admin.companyId,
    jobId,
    title: '📄 견적 요청',
    text: `${admin.companyName} · ${title}${due ? ` · 마감 ${due}` : ''}\n앱에서 금액을 적어 견적을 보내 주세요.`,
    url: `${await siteOrigin()}/quote/${token}`.replace(/^https?:\/\/[^/]+/, ''),
    tag: `quote-${token.slice(0, 8)}`,
  })
}

/** 이 회사 견적 요청에 딸린 견적 (다른 회사 것이면 null) */
async function companyQuote<T extends Pick<Quote, 'request_id'>>(admin: AdminUser, quoteId: string, cols = '*'): Promise<T | null> {
  if (!isUuid(quoteId)) return null
  const { data } = await db().from('quotes').select(cols).eq('id', quoteId).maybeSingle()
  const q = data as T | null
  if (!q || !(await companyRow(admin, 'quote_requests', q.request_id, 'id'))) return null
  return q
}

function refresh(...paths: string[]) {
  revalidatePath('/admin/vendors')
  revalidatePath('/admin')
  for (const p of paths) revalidatePath(p)
}

// ───────────── 외주사 ─────────────

/** 외주사 등록·수정. 계좌번호는 암호화해서 저장하고, 수정할 때 비워 두면 그대로 둠 */
export async function saveVendor(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (id && !isUuid(id)) return { error: '잘못된 요청입니다.' }
  const name = line(form, 'name', 60)
  if (name.length < 2) return { error: '상호를 입력해 주세요.' }
  const email = optStr(form, 'email', 100)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: '이메일 주소를 확인해 주세요.' }
  const account = str(form, 'bank_account', 40).replace(/[^\d-]/g, '')
  if (account) {
    const digits = account.replace(/\D/g, '').length
    if (!optLine(form, 'bank_name', 30)) return { error: '계좌의 은행을 골라 주세요.' }
    if (digits < 10 || digits > 16) return { error: `계좌번호가 ${digits}자리예요. 숫자 10~16자리인지 확인해 주세요.` }
  }
  const row: Partial<Vendor> = {
    name,
    category: optStr(form, 'category', 30),
    contact_name: optLine(form, 'contact_name', 30),
    phone: optStr(form, 'phone', 20),
    email,
    business_no: optStr(form, 'business_no', 20),
    account_holder: optLine(form, 'account_holder', 40),
    memo: optStr(form, 'memo', 500),
  }
  if (account) {
    row.bank_name = optLine(form, 'bank_name', 30)
    row.bank_account_enc = encrypt(account)
  } else if (!id || form.get('clear_account') === 'on') {
    row.bank_name = null
    row.bank_account_enc = null
  }
  // 가입한 전문가·외주 업체 계정과 이어 두면 견적 요청·대금이 그 사람 앱으로 감 (같은 휴대폰·사업자번호)
  row.user_id = await findPartnerAccount(row.phone ?? null, row.business_no ?? null)
  if (id) {
    if (!(await companyRow(admin, 'vendors', id, 'id'))) return { error: '외주사를 찾을 수 없어요.' }
    row.active = form.get('active') === 'on'
    must(await db().from('vendors').update(row).eq('id', id).eq('company_id', admin.companyId))
    await audit(admin.id, 'vendor.edit', null, name, admin.companyId)
    refresh(`/admin/vendors/${id}`)
    return { ok: '저장했어요.' }
  }
  const { data, error } = await db().from('vendors').insert({ ...row, company_id: admin.companyId, active: true }).select('id').single()
  if (error || !data) return { error: '등록하지 못했어요. 다시 시도해 주세요.' }
  await audit(admin.id, 'vendor.add', null, name, admin.companyId)
  refresh()
  back('/admin/vendors?tab=list', `${name}을(를) 외주사로 등록했어요.`)
}

// ───────────── 견적 요청 ─────────────

/** 견적 요청 만들기: 고른 업체마다 입력 링크(token)를 만들어 둠 */
export async function createQuoteRequest(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  const title = str(form, 'title', 80)
  if (title.length < 2) return { error: '무엇을 요청하는지 제목을 적어 주세요. (예: 무대 음향 장비 2일)' }
  const jobId = str(form, 'job_id', 40)
  const job = jobId ? await companyJob(admin, jobId) : null
  if (jobId && !job) return { error: '연결할 공고를 찾을 수 없어요.' }
  const vendorIds = [...new Set(form.getAll('vendor').map(String).filter(isUuid))]
  if (!vendorIds.length) return { error: '견적을 받을 업체를 한 곳 이상 골라 주세요.' }
  const vendors = (must(await db().from('vendors').select('id, active').eq('company_id', admin.companyId).in('id', vendorIds)) as Pick<Vendor, 'id' | 'active'>[]).filter(
    (v) => v.active && vendorIds.includes(v.id),
  )
  if (!vendors.length) return { error: '고른 업체를 찾을 수 없어요.' }
  const { data, error } = await db()
    .from('quote_requests')
    .insert({
      company_id: admin.companyId,
      title,
      details: optStr(form, 'details', 2000),
      due_date: dateOrNull(form, 'due_date'),
      job_id: job?.id ?? null,
      created_by: admin.id,
      status: 'open',
    })
    .select('id')
    .single()
  if (error || !data) return { error: '견적 요청을 만들지 못했어요. 다시 시도해 주세요.' }
  const rows = vendors.map((v) => ({ request_id: data.id, vendor_id: v.id, token: newToken(), status: 'requested', vat_included: true }))
  must(await db().from('quotes').insert(rows))
  // 앱에 가입한 업체·전문가에게는 바로 알림 (링크를 따로 보내지 않아도 됨)
  const dueText = dateOrNull(form, 'due_date')
  for (const r of rows) await askPartner(admin, r.vendor_id, r.token, title, dueText, job?.id ?? null)
  await audit(admin.id, 'quote.request', null, `${title} · ${vendors.length}곳`, admin.companyId)
  refresh()
  back(`/admin/vendors/requests/${data.id}`, `견적 요청을 만들었어요. 업체마다 링크를 보내 주세요.`)
}

/** 견적 요청에 업체 더 넣기 */
export async function addVendorsToRequest(requestId: string, form: FormData) {
  const admin = await requireAdmin()
  if (!(await companyRow(admin, 'quote_requests', requestId, 'id'))) return
  const path = `/admin/vendors/requests/${requestId}`
  const picked = [...new Set(form.getAll('vendor').map(String).filter(isUuid))]
  if (!picked.length) back(path, '더할 업체를 골라 주세요.')
  // 이 회사 외주사만
  const ids = (must(await db().from('vendors').select('id').eq('company_id', admin.companyId).in('id', picked)) as { id: string }[]).map((v) => v.id)
  const have = new Set((must(await db().from('quotes').select('vendor_id').eq('request_id', requestId)) as { vendor_id: string }[]).map((q) => q.vendor_id))
  const add = ids.filter((v) => !have.has(v))
  if (add.length) {
    const rows = add.map((v) => ({ request_id: requestId, vendor_id: v, token: newToken(), status: 'requested', vat_included: true }))
    must(await db().from('quotes').insert(rows))
    const req = await companyRow<QuoteRequest>(admin, 'quote_requests', requestId)
    if (req) for (const r of rows) await askPartner(admin, r.vendor_id, r.token, req.title, req.due_date, req.job_id)
  }
  refresh(path)
  back(path, add.length ? `${add.length}곳을 더했어요. 링크를 보내 주세요.` : '이미 들어 있는 업체예요.')
}

/** 관리자가 전화·메일로 받은 견적을 기록 */
export async function recordQuote(quoteId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (!isUuid(quoteId)) return { error: '잘못된 요청입니다.' }
  const amount = amountOf(form)
  if (amount == null) return { error: '견적 금액을 숫자로 적어 주세요.' }
  const q = await companyQuote<Pick<Quote, 'id' | 'request_id' | 'status'>>(admin, quoteId, 'id, request_id, status')
  if (!q) return { error: '견적을 찾을 수 없어요.' }
  if (q.status === 'selected') return { error: '선정한 견적은 바꿀 수 없어요. 선정을 취소한 뒤 고쳐 주세요.' }
  must(
    await db()
      .from('quotes')
      .update({
        amount,
        vat_included: form.get('vat') !== 'excluded',
        note: optStr(form, 'note', 1000),
        status: 'submitted',
        submitted_by: 'admin',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', quoteId),
  )
  await audit(admin.id, 'quote.record', null, `${quoteId} ${amount}`, admin.companyId)
  refresh(`/admin/vendors/requests/${q.request_id}`)
  return { ok: `${won(amount)}으로 기록했어요.` }
}

/** 견적 선정: 이 견적을 선정하고 같은 요청의 다른 견적은 미선정, 요청은 마감, 대금 지급에 올림 */
export async function selectQuote(quoteId: string) {
  const admin = await requireAdmin()
  const q = await companyQuote<Quote>(admin, quoteId)
  if (!q) return
  const path = `/admin/vendors/requests/${q.request_id}`
  if (q.amount == null) back(path, '금액이 있는 견적만 선정할 수 있어요.')
  const { data: reqData } = await db().from('quote_requests').select('*').eq('id', q.request_id).maybeSingle()
  const req = reqData as QuoteRequest | null
  if (!req) back(path, '견적 요청을 찾을 수 없어요.')
  const others = (must(await db().from('quotes').select('id, status').eq('request_id', q.request_id)) as Pick<Quote, 'id' | 'status'>[]).filter(
    (o) => o.id !== q.id,
  )
  must(await db().from('quotes').update({ status: 'selected' }).eq('id', q.id))
  for (const o of others) if (o.status !== 'rejected') must(await db().from('quotes').update({ status: 'rejected' }).eq('id', o.id))
  must(await db().from('quote_requests').update({ status: 'closed' }).eq('id', req.id))
  // 이미 이 견적으로 만든 지급 건이 없으면 만듦 (지급 예정일은 지급 탭에서)
  const { count } = await db().from('vendor_payments').select('id', { count: 'exact', head: true }).eq('quote_id', q.id)
  if (!count) {
    must(
      await db().from('vendor_payments').insert({
        company_id: req.company_id,
        vendor_id: q.vendor_id,
        job_id: req.job_id,
        quote_id: q.id,
        title: req.title,
        amount: q.amount,
        vat_included: q.vat_included,
      }),
    )
  }
  await audit(admin.id, 'quote.select', null, `${req.title} ${q.amount}`, admin.companyId)
  refresh(path, req.job_id ? `/admin/jobs/${req.job_id}` : '/admin/vendors')
  await tellPartner(q.vendor_id, {
    companyId: admin.companyId,
    jobId: req.job_id,
    title: '🎉 견적이 선정됐어요',
    text: `${admin.companyName} · ${req.title} · ${won(q.amount)}\n대금 지급 예정일은 앱 ‘견적·대금’에서 볼 수 있어요.`,
    url: '/pro/money',
    tag: `quote-sel-${q.id.slice(0, 8)}`,
  })
  back(path, `선정했어요. 대금 지급에 ${won(q.amount)}을 올렸어요. 지급 예정일을 정해 주세요.`)
}

/** 선정 취소 (실수했을 때): 견적들을 다시 비교할 수 있게 되돌리고, 아직 지급 안 한 지급 건은 지움 */
export async function unselectQuote(quoteId: string) {
  const admin = await requireAdmin()
  const q = await companyQuote<Pick<Quote, 'id' | 'request_id' | 'status'>>(admin, quoteId, 'id, request_id, status')
  if (!q || q.status !== 'selected') return
  const path = `/admin/vendors/requests/${q.request_id}`
  const pays = must(await db().from('vendor_payments').select('id, paid_at').eq('quote_id', q.id)) as Pick<VendorPayment, 'id' | 'paid_at'>[]
  if (pays.some((p) => p.paid_at)) back(path, '이미 지급한 견적은 선정을 취소할 수 없어요.')
  for (const p of pays) must(await db().from('vendor_payments').delete().eq('id', p.id))
  const all = must(await db().from('quotes').select('id, amount').eq('request_id', q.request_id)) as Pick<Quote, 'id' | 'amount'>[]
  for (const o of all) must(await db().from('quotes').update({ status: o.amount == null ? 'requested' : 'submitted' }).eq('id', o.id))
  must(await db().from('quote_requests').update({ status: 'open' }).eq('id', q.request_id))
  await audit(admin.id, 'quote.unselect', null, q.id, admin.companyId)
  refresh(path)
  back(path, '선정을 취소했어요. 다시 비교해서 골라 주세요.')
}

/** 견적 요청 마감·다시 열기·취소 */
export async function setRequestStatus(requestId: string, status: QuoteRequest['status']) {
  const admin = await requireAdmin()
  if (!isUuid(requestId) || !['open', 'closed', 'cancelled'].includes(status)) return
  must(await db().from('quote_requests').update({ status }).eq('id', requestId).eq('company_id', admin.companyId))
  const path = `/admin/vendors/requests/${requestId}`
  refresh(path)
  back(path, status === 'open' ? '견적 요청을 다시 열었어요.' : status === 'closed' ? '견적 요청을 마감했어요.' : '견적 요청을 취소했어요.')
}

// ───────────── 대금 지급 ─────────────

/** 지급 건 등록·수정 (견적 없이 바로 등록도 가능) */
export async function savePayment(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin()
  if (id && !isUuid(id)) return { error: '잘못된 요청입니다.' }
  const vendorId = str(form, 'vendor_id', 40)
  if (!isUuid(vendorId)) return { error: '외주사를 골라 주세요.' }
  const title = str(form, 'title', 80)
  if (title.length < 2) return { error: '무엇에 대한 대금인지 적어 주세요.' }
  const amount = amountOf(form)
  if (amount == null) return { error: '금액을 숫자로 적어 주세요.' }
  const jobId = str(form, 'job_id', 40)
  if (jobId && !(await companyJob(admin, jobId))) return { error: '연결할 공고를 다시 골라 주세요.' }
  if (!(await companyRow(admin, 'vendors', vendorId, 'id'))) return { error: '외주사를 골라 주세요.' }
  if (id && !(await companyRow(admin, 'vendor_payments', id, 'id'))) return { error: '지급 건을 찾을 수 없어요.' }
  const row = {
    vendor_id: vendorId,
    job_id: jobId || null,
    title,
    amount,
    vat_included: form.get('vat') !== 'excluded',
    due_date: dateOrNull(form, 'due_date'),
    memo: optStr(form, 'memo', 500),
  }
  if (id) {
    must(await db().from('vendor_payments').update(row).eq('id', id).eq('company_id', admin.companyId))
  } else {
    must(await db().from('vendor_payments').insert({ ...row, company_id: admin.companyId }))
  }
  await audit(admin.id, id ? 'vpay.edit' : 'vpay.add', null, `${title} ${amount}`, admin.companyId)
  refresh(jobId ? `/admin/jobs/${jobId}` : '/admin/vendors')
  return { ok: id ? '저장했어요.' : `${won(amount)} 지급 건을 등록했어요.` }
}

/** 지급 예정일만 바꾸기 (목록에서 바로) */
export async function setPaymentDue(paymentId: string, form: FormData) {
  const admin = await requireAdmin()
  if (!isUuid(paymentId)) return
  must(await db().from('vendor_payments').update({ due_date: dateOrNull(form, 'due_date') }).eq('id', paymentId).eq('company_id', admin.companyId))
  refresh()
}

/** 세금계산서 받음 표시 (오늘 날짜) / 취소 */
export async function markInvoice(paymentId: string, received: boolean) {
  const admin = await requireAdmin()
  if (!isUuid(paymentId)) return
  must(await db().from('vendor_payments').update({ invoice_at: received ? kstDate() : null }).eq('id', paymentId).eq('company_id', admin.companyId))
  await audit(admin.id, received ? 'vpay.invoice' : 'vpay.invoice_undo', null, paymentId, admin.companyId)
  refresh()
}

/** 지급 완료 표시 (오늘 날짜) / 취소 */
export async function markVendorPaid(paymentId: string, paid: boolean) {
  const admin = await requireAdmin()
  if (!isUuid(paymentId)) return
  const data = await companyRow<{ job_id: string | null; company_id: string; vendor_id: string; title: string; amount: number; paid_at: string | null }>(
    admin,
    'vendor_payments',
    paymentId,
    'job_id, vendor_id, title, amount, paid_at',
  )
  if (!data) return
  must(await db().from('vendor_payments').update({ paid_at: paid ? kstDate() : null }).eq('id', paymentId).eq('company_id', admin.companyId))
  await audit(admin.id, paid ? 'vpay.paid' : 'vpay.unpaid', null, paymentId, admin.companyId)
  // 새로 지급 완료가 되면 앱에 가입한 업체·전문가에게 알림
  if (paid && !data.paid_at) {
    await tellPartner(data.vendor_id, {
      companyId: admin.companyId,
      jobId: data.job_id,
      title: '💸 대금을 보냈어요',
      text: `${admin.companyName} · ${data.title} · ${won(data.amount)}`,
      url: '/pro/money',
      tag: `vpay-${paymentId.slice(0, 8)}`,
    })
  }
  refresh(data.job_id ? `/admin/jobs/${data.job_id}` : '/admin/vendors')
}

/** 지급 건 지우기 (아직 지급하지 않은 것만) */
export async function deletePayment(paymentId: string) {
  const admin = await requireAdmin()
  if (!isUuid(paymentId)) return
  const data = await companyRow<{ paid_at: string | null; title: string; company_id: string }>(admin, 'vendor_payments', paymentId, 'paid_at, title')
  if (!data || data.paid_at) back('/admin/vendors?tab=pay', '이미 지급한 건은 지울 수 없어요.')
  must(await db().from('vendor_payments').delete().eq('id', paymentId).eq('company_id', admin.companyId))
  await audit(admin.id, 'vpay.delete', null, data.title, admin.companyId)
  refresh()
  back('/admin/vendors?tab=pay', '지급 건을 지웠어요.')
}

// ───────────── 업체가 링크로 견적 내기 (로그인 없음) ─────────────

/** 업체가 견적 요청 링크에서 금액·내용을 냄. 마감·선정 전까지는 다시 내서 고칠 수 있음 */
export async function submitQuote(token: string, _: FormState, form: FormData): Promise<FormState> {
  if (caughtByHoneypot(form)) return { error: '보내지 못했어요. 잠시 후 다시 시도해 주세요.' }
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { error: '링크가 올바르지 않아요.' }
  if (await overLimit(await ipKey('quote-submit'), 30, 3600)) return { error: '너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.' }
  const { data } = await db().from('quotes').select('*').eq('token', token).maybeSingle()
  const q = data as Quote | null
  if (!q) return { error: '링크가 올바르지 않아요.' }
  const [{ data: reqData }, { data: vendor }] = await Promise.all([
    db().from('quote_requests').select('*').eq('id', q.request_id).maybeSingle(),
    db().from('vendors').select('name').eq('id', q.vendor_id).maybeSingle(),
  ])
  const req = reqData as QuoteRequest | null
  if (!req || req.status !== 'open' || q.status === 'selected' || q.status === 'rejected') return { error: '견적 접수가 마감됐어요. 담당자에게 문의해 주세요.' }
  const amount = amountOf(form)
  if (amount == null || amount < 1) return { error: '견적 금액을 숫자로 적어 주세요.' }
  must(
    await db()
      .from('quotes')
      .update({
        amount,
        vat_included: form.get('vat') !== 'excluded',
        note: optStr(form, 'note', 1000),
        status: 'submitted',
        submitted_by: 'vendor',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', q.id)
      .in('status', ['requested', 'submitted']),
  )
  const name = (vendor as { name: string } | null)?.name ?? '외주사'
  after(async () =>
    sendPush(await adminIds(req.company_id), {
      title: '📄 견적 도착',
      body: `${name} · ${req.title} · ${won(amount)}`,
      url: `/admin/vendors/requests/${req.id}`,
      tag: `quote-${req.id}`,
    }),
  )
  revalidatePath(`/admin/vendors/requests/${req.id}`)
  revalidatePath('/admin/vendors')
  revalidatePath(`/quote/${token}`)
  return { ok: `${won(amount)} 견적을 보냈어요. 감사합니다! 마감 전까지는 다시 보내서 고칠 수 있어요.` }
}
