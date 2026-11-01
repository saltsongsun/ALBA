import 'server-only'
import { db } from './db'
import { tellWorkers } from './notify'
import { phoneFmt } from './format'
import { bizNoFmt } from './members'

/**
 * 가입한 전문가·외주 업체 계정을 회사들이 등록해 둔 외주사와 잇기 (아직 계정이 안 이어진 것만).
 * 같은 사업자등록번호이거나 같은 휴대폰 번호면 같은 업체로 봄 → 견적 요청·대금을 앱에서 봄
 */
export async function linkVendorAccount(userId: string, bizNo: string | null, phone: string): Promise<number> {
  const phones = [phone, phoneFmt(phone)]
  const [{ data: byPhone }, { data: byBiz }] = await Promise.all([
    db().from('vendors').select('id, user_id').in('phone', phones).is('user_id', null),
    bizNo ? db().from('vendors').select('id, user_id').in('business_no', [bizNo, bizNoFmt(bizNo)]).is('user_id', null) : { data: [] },
  ])
  const ids = [...new Set([...((byPhone ?? []) as { id: string; user_id: string | null }[]), ...((byBiz ?? []) as { id: string; user_id: string | null }[])].filter((v) => !v.user_id).map((v) => v.id))]
  if (ids.length) await db().from('vendors').update({ user_id: userId }).in('id', ids).is('user_id', null)
  return ids.length
}

/** 외주사 정보(휴대폰·사업자번호)로 가입한 전문가·외주 업체 계정 찾기 (관리자가 외주사를 등록·수정할 때) */
export async function findPartnerAccount(phone: string | null, bizNo: string | null): Promise<string | null> {
  const digits = (bizNo ?? '').replace(/\D/g, '')
  const tel = (phone ?? '').replace(/\D/g, '')
  const [{ data: byBiz }, { data: byPhone }] = await Promise.all([
    digits.length === 10 ? db().from('users').select('id, member_type').eq('biz_no', digits).maybeSingle() : { data: null },
    tel.length >= 10 ? db().from('users').select('id, member_type').eq('phone', tel).maybeSingle() : { data: null },
  ])
  for (const u of [byBiz, byPhone] as ({ id: string; member_type: string } | null)[]) {
    if (u && (u.member_type === 'vendor' || u.member_type === 'expert')) return u.id
  }
  return null
}

/** 외주사와 이어진 계정이 있으면 그 사람 문의함 + 휴대폰 알림으로 (견적 요청·선정·지급) */
export async function tellPartner(
  vendorId: string,
  o: { companyId: string; jobId: string | null; title: string; text: string; url: string; tag?: string },
): Promise<boolean> {
  const { data } = await db().from('vendors').select('user_id').eq('id', vendorId).maybeSingle()
  const uid = (data as { user_id: string | null } | null)?.user_id
  if (!uid) return false
  await tellWorkers([uid], { senderId: null, companyId: o.companyId, jobId: o.jobId, title: o.title, text: o.text, url: o.url, tag: o.tag })
  return true
}

export type PartnerQuote = {
  id: string
  token: string
  amount: number | null
  vat_included: boolean
  status: 'requested' | 'submitted' | 'selected' | 'rejected'
  submitted_at: string | null
  request: { id: string; title: string; details: string | null; due_date: string | null; status: string; company_id: string; job_id: string | null } | null
  company: string
}

export type PartnerPayment = {
  id: string
  title: string
  amount: number
  vat_included: boolean
  due_date: string | null
  invoice_at: string | null
  paid_at: string | null
  company: string
}

/** 내 계정과 이어진 외주사들 (여러 회사가 각자 등록) */
async function myVendorIds(userId: string): Promise<string[]> {
  const { data } = await db().from('vendors').select('id').eq('user_id', userId)
  return ((data ?? []) as { id: string }[]).map((v) => v.id)
}

async function companyNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const { data } = await db().from('companies').select('id, company_name').in('id', [...new Set(ids)])
  return new Map(((data ?? []) as { id: string; company_name: string }[]).map((c) => [c.id, c.company_name]))
}

/** 전문가·외주 업체가 받은 견적 요청 (최근 순) */
export async function partnerQuotes(userId: string): Promise<PartnerQuote[]> {
  const vids = await myVendorIds(userId)
  if (!vids.length) return []
  const { data } = await db()
    .from('quotes')
    .select('id, token, amount, vat_included, status, submitted_at, request_id, created_at')
    .in('vendor_id', vids)
    .order('created_at', { ascending: false })
    .limit(100)
  const quotes = (data ?? []) as (Omit<PartnerQuote, 'request' | 'company'> & { request_id: string; created_at: string })[]
  if (!quotes.length) return []
  const { data: reqs } = await db()
    .from('quote_requests')
    .select('id, title, details, due_date, status, company_id, job_id')
    .in('id', [...new Set(quotes.map((q) => q.request_id))])
  const reqOf = new Map(((reqs ?? []) as NonNullable<PartnerQuote['request']>[]).map((r) => [r.id, r]))
  const names = await companyNames([...reqOf.values()].map((r) => r.company_id))
  return quotes
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((q) => {
      const request = reqOf.get(q.request_id) ?? null
      return { ...q, request, company: request ? (names.get(request.company_id) ?? '') : '' }
    })
}

/** 전문가·외주 업체가 받을 대금 (지급 예정 → 지급 완료 순) */
export async function partnerPayments(userId: string): Promise<PartnerPayment[]> {
  const vids = await myVendorIds(userId)
  if (!vids.length) return []
  const { data } = await db()
    .from('vendor_payments')
    .select('id, title, amount, vat_included, due_date, invoice_at, paid_at, company_id, created_at')
    .in('vendor_id', vids)
    .limit(200)
  const rows = (data ?? []) as (Omit<PartnerPayment, 'company'> & { company_id: string; created_at: string })[]
  const names = await companyNames(rows.map((r) => r.company_id))
  return rows
    .map((r) => ({ ...r, company: names.get(r.company_id) ?? '' }))
    .sort((a, b) => Number(!!a.paid_at) - Number(!!b.paid_at) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.created_at.localeCompare(a.created_at))
}
