import 'server-only'
import { getJob, getSettings } from './data'
import { db } from './db'
import { buildDocVars, renderTemplate, type DocPerson } from './docs'
import type { PdfDoc } from './docPdf'
import { phoneFmt } from './format'
import type { CompanySnapshot, DocKind, DocTemplate, Job, Settings, SignedDoc } from './types'
import { isUuid } from './validate'

/**
 * 관리자 '서류' 메뉴: 이 회사에서 근무자에게 받은(받을) 서류를 모아 보고 거르기.
 * 화면 목록과 PDF 내려받기가 같은 거르기를 써서, 화면에 보이는 서류가 그대로 PDF로 묶임
 */

export const DOC_KIND_LABEL: Record<DocKind, string> = { contract: '근로계약서', service: '용역계약서', pledge: '서약서', consent: '동의서', other: '기타' }

export type DocFilter = { q: string; job: string | null; status: 'signed' | 'pending' | 'void' | null; kind: DocKind | null }

export function parseDocFilter(sp: Record<string, string | string[] | undefined> | URLSearchParams): DocFilter {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k]
    return typeof v === 'string' ? v : null
  }
  const status = get('status')
  const kind = get('kind')
  const job = get('job')
  return {
    q: (get('q') ?? '').trim().slice(0, 40),
    job: job && isUuid(job) ? job : null,
    status: status === 'signed' || status === 'pending' || status === 'void' ? status : null,
    kind: kind && kind in DOC_KIND_LABEL ? (kind as DocKind) : null,
  }
}

/** 거르기를 주소 뒤 글자로 (목록 ↔ PDF 링크가 같은 조건을 쓰게) */
export function filterQuery(f: DocFilter, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.job) p.set('job', f.job)
  if (f.status) p.set('status', f.status)
  if (f.kind) p.set('kind', f.kind)
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export type DocRow = Pick<SignedDoc, 'id' | 'job_id' | 'user_id' | 'kind' | 'title' | 'status' | 'signed_at' | 'created_at'> & {
  worker: { name: string; phone: string } | null
  job: Pick<Job, 'id' | 'title' | 'start_date' | 'end_date'> | null
}

export const DOC_LIMIT = 500

/** 이 회사 서류 (최근 것부터) · 무효 서류는 '무효'를 고를 때만 */
export async function companyDocs(companyId: string, f: DocFilter): Promise<{ rows: DocRow[]; base: DocRow[]; all: DocRow[] }> {
  let query = db().from('signed_docs').select('id, job_id, user_id, kind, title, status, signed_at, created_at, company_id').eq('company_id', companyId)
  if (f.job) query = query.eq('job_id', f.job)
  const { data } = await query.order('created_at', { ascending: false }).limit(3000)
  const docs = ((data ?? []) as (DocRow & { company_id: string })[]).filter((d) => d.company_id === companyId && (!f.job || d.job_id === f.job))
  const userIds = [...new Set(docs.map((d) => d.user_id))]
  const jobIds = [...new Set(docs.map((d) => d.job_id))]
  const [{ data: users }, { data: jobs }] = await Promise.all([
    userIds.length ? db().from('users').select('id, name, phone').in('id', userIds) : { data: [] },
    jobIds.length ? db().from('jobs').select('id, title, start_date, end_date, company_id').in('id', jobIds).eq('company_id', companyId) : { data: [] },
  ])
  const userOf = new Map(((users ?? []) as { id: string; name: string; phone: string }[]).map((u) => [u.id, u]))
  const jobOf = new Map(((jobs ?? []) as (DocRow['job'] & { company_id: string })[]).filter((j) => j!.company_id === companyId).map((j) => [j!.id, j]))
  const all: DocRow[] = docs
    .map((d) => ({ ...d, worker: userOf.get(d.user_id) ?? null, job: jobOf.get(d.job_id) ?? null }))
    .sort((a, b) => (b.signed_at ?? b.created_at).localeCompare(a.signed_at ?? a.created_at))
  const low = f.q.toLowerCase()
  const digits = f.q.replace(/\D/g, '')
  // base: 상태만 빼고 거른 것 (상태 칩의 숫자) · rows: 상태까지 거른 것 (무효는 '무효'를 고를 때만)
  const base = all.filter(
    (d) =>
      (!f.kind || d.kind === f.kind) &&
      (!low ||
        d.title.toLowerCase().includes(low) ||
        (d.worker?.name ?? '').toLowerCase().includes(low) ||
        (d.job?.title ?? '').toLowerCase().includes(low) ||
        (digits.length >= 3 && (d.worker?.phone ?? '').replace(/\D/g, '').includes(digits))),
  )
  const rows = base.filter((d) => (f.status ? d.status === f.status : d.status !== 'void'))
  return { rows: rows.slice(0, DOC_LIMIT), base, all }
}

/**
 * PDF로 만들 서류 내용: 서명한 서류는 서명 당시 그대로(본문·회사 정보·직인), 아직이면 지금 서식으로 채워서 (서류 화면과 같은 규칙)
 * 같은 공고·서식·회사 설정은 한 번만 읽음
 */
export async function docsForPdf(companyId: string, ids: string[]): Promise<PdfDoc[]> {
  if (!ids.length) return []
  const { data } = await db().from('signed_docs').select('*, worker:users(name, phone, birth_date, address)').in('id', ids).eq('company_id', companyId)
  const docs = ((data ?? []) as (SignedDoc & { worker: DocPerson | null })[]).filter((d) => d.company_id === companyId && ids.includes(d.id))
  const order = new Map(ids.map((id, i) => [id, i]))
  docs.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  let settings: Promise<Settings> | null = null
  const jobs = new Map<string, Promise<Job | null>>()
  const tpls = new Map<string, Promise<DocTemplate | null>>()
  const out: PdfDoc[] = []
  for (const doc of docs) {
    const worker = doc.worker ?? { name: '(알 수 없음)', phone: '', birth_date: null, address: null }
    let body = doc.body ?? ''
    let company: CompanySnapshot | null = doc.company_snapshot
    let seal = doc.seal_image
    if (doc.status !== 'signed') {
      settings ??= getSettings(companyId, { seal: true })
      if (!jobs.has(doc.job_id)) jobs.set(doc.job_id, getJob(doc.job_id))
      const tid = doc.template_id
      if (tid && !tpls.has(tid))
        tpls.set(
          tid,
          Promise.resolve(db().from('doc_templates').select('*').eq('id', tid).eq('company_id', companyId).maybeSingle()).then((r) => (r.data as DocTemplate | null) ?? null),
        )
      const [s, job, tpl] = await Promise.all([settings, jobs.get(doc.job_id)!, tid ? tpls.get(tid)! : null])
      body = job && tpl ? renderTemplate(tpl.body, buildDocVars(job, worker, s)) : body || `# ${doc.title}\n\n서식을 찾을 수 없어요.`
      company = s
      seal = s.seal_image
    }
    out.push({
      id: doc.id,
      title: doc.title,
      body,
      company: company ?? { company_name: '', ceo_name: null, business_no: null, company_address: null, company_phone: null },
      seal,
      worker: { name: worker.name, birth_date: worker.birth_date, phone: phoneFmt(worker.phone ?? '') },
      signature: doc.signature,
      signedAt: doc.signed_at,
      signedIp: doc.signed_ip,
      status: doc.status,
      parties: doc.kind === 'service' ? 'service' : 'labor',
    })
  }
  return out
}
