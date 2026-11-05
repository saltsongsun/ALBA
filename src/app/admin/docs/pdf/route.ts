import { audit } from '@/lib/data'
import { companyDocs, docsForPdf, DOC_KIND_LABEL, parseDocFilter } from '@/lib/docList'
import { docsToPdf, pdfResponse } from '@/lib/docPdf'
import { overLimit } from '@/lib/ratelimit'
import { getUser, requireAdmin } from '@/lib/session'
import { kstDate } from '@/lib/time'
import { isUuid } from '@/lib/validate'

/** 한 번에 묶는 최대 건수 (서버가 오래 걸리지 않게) */
const MAX = 300

const text = (msg: string, status: number) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

/**
 * 관리자: 서류를 PDF로 내려받기 (인쇄·보관용)
 * - ?id=… (여러 번 가능): 고른 서류만
 * - 그 밖: '서류' 메뉴와 같은 거르기(q·job·status·kind)로 보이는 서류를 한 파일로 (서류마다 새 쪽)
 * 이 회사 서류만 · 내려받기 기록을 남김 · 계정이 털려도 마구 빼 가지 못하게 횟수 제한
 */
export async function GET(req: Request) {
  const user = await getUser()
  if (!user || user.role !== 'admin') return text('관리자만 내려받을 수 있어요.', 403)
  const admin = await requireAdmin()
  if (await overLimit(`doc-pdf:${admin.id}`, 60, 3600)) return text('내려받기가 너무 잦아요. 한 시간 뒤에 다시 시도해 주세요.', 429)
  const url = new URL(req.url)
  const picked = url.searchParams.getAll('id').filter(isUuid).slice(0, MAX)
  const filter = parseDocFilter(url.searchParams)
  let ids: string[]
  let label: string
  if (picked.length) {
    ids = picked
    label = ''
  } else {
    const { rows } = await companyDocs(admin.companyId, filter)
    if (rows.length > MAX) return text(`한 번에 ${MAX}건까지 받을 수 있어요. 공고나 상태로 좁혀 주세요.`, 400)
    ids = rows.map((r) => r.id)
    label = [rows.find((r) => r.job_id === filter.job)?.job?.title, filter.kind ? DOC_KIND_LABEL[filter.kind] : null, filter.status === 'signed' ? '서명 완료' : filter.status === 'pending' ? '서명 대기' : null]
      .filter(Boolean)
      .join('_')
  }
  const docs = await docsForPdf(admin.companyId, ids)
  if (!docs.length) return text('내려받을 서류가 없어요.', 404)
  const name = docs.length === 1 ? `${docs[0].title}_${docs[0].worker.name}_${(docs[0].signedAt ? kstDate(docs[0].signedAt) : kstDate())}` : `서류_${label || '모음'}_${docs.length}건_${kstDate()}`
  const bytes = await docsToPdf(docs, { title: name })
  await audit(admin.id, 'doc.pdf', null, `${docs.length}건${label ? ` · ${label}` : docs.length === 1 ? ` · ${docs[0].title} · ${docs[0].worker.name}` : ''}`, admin.companyId)
  return pdfResponse(bytes, name)
}
