import { fmtDateLong, kstDate, kstDateTime } from '@/lib/time'
import type { CompanySnapshot } from '@/lib/types'
import SealMark from './SealMark'

/** '# ' 제목, '## ' 소제목, '- ' 목록만 해석하는 아주 단순한 서식 */
export function DocBody({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
          {list.map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    if (line.startsWith('- ')) {
      list.push(line.slice(2))
      return
    }
    flush()
    if (line.startsWith('# ')) {
      blocks.push(
        <h1 key={i} className="mb-5 text-center text-2xl font-extrabold tracking-wider">
          {line.slice(2)}
        </h1>,
      )
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h2 key={i} className="mt-4 mb-1 font-bold">
          {line.slice(3)}
        </h2>,
      )
    } else if (line.trim()) {
      blocks.push(
        <p key={i} className="my-1">
          {line}
        </p>,
      )
    }
  })
  flush()
  return <div className="text-[14.5px] leading-relaxed">{blocks}</div>
}

/** 서류 배경 워터마크: 열람 일시·열람자를 옅게 비스듬히 반복 (인쇄해도 찍힘) */
function watermarkStyle(text: string): React.CSSProperties {
  const esc = text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='170'><text x='150' y='95' text-anchor='middle' transform='rotate(-24 150 85)' fill='rgba(37,87,232,0.13)' font-size='14' font-weight='700' font-family='Pretendard Variable, sans-serif'>${esc}</text></svg>`
  return {
    backgroundImage: `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`,
    backgroundRepeat: 'repeat',
    printColorAdjust: 'exact',
    WebkitPrintColorAdjust: 'exact',
  }
}

export default function DocSheet({
  docId,
  body,
  company,
  seal,
  worker,
  signature,
  signedAt,
  signedIp,
  watermark,
}: {
  docId: string
  body: string
  company: CompanySnapshot
  seal: string | null
  worker: { name: string; birth_date: string | null; phone: string }
  signature: string | null
  signedAt: string | null
  signedIp?: string | null
  /** 서류 뒤에 비스듬히 반복해서 찍는 글자 (열람 일시·열람자) */
  watermark?: string
}) {
  const mark = watermark ? watermarkStyle(watermark) : undefined
  return (
    <article className="print-sheet card px-6 py-8 sm:px-10" style={mark}>
      <DocBody text={body} />
      <p className="mt-8 text-center font-semibold">{fmtDateLong(signedAt ? kstDate(signedAt) : kstDate())}</p>
      <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <p className="mb-1 font-bold">(사업주)</p>
          <p>상호: {company.company_name}</p>
          {company.business_no && <p>사업자등록번호: {company.business_no}</p>}
          {company.company_address && <p>주소: {company.company_address}</p>}
          {company.company_phone && <p>전화: {company.company_phone}</p>}
          <p>
            대표자: {company.ceo_name ?? ''} <SealMark seal={seal} />
          </p>
        </div>
        <div className="space-y-1">
          <p className="mb-1 font-bold">(근로자)</p>
          <p>성명: {worker.name}</p>
          {worker.birth_date && <p>생년월일: {fmtDateLong(worker.birth_date)}</p>}
          <p>연락처: {worker.phone}</p>
          <p className="relative">
            서명: <span className="text-mute">{signature ? '' : '(서명 전)'}</span>
            {signature && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signature} alt="근로자 서명" className="absolute -top-6 left-10 h-16 w-40 object-contain" />
            )}
          </p>
        </div>
      </div>
      {signedAt && (
        <p className="mt-10 border-t border-line pt-3 text-[11px] text-mute">
          전자서명 일시 {kstDateTime(signedAt)} · 문서번호 {docId.slice(0, 8).toUpperCase()}
          {signedIp ? ` · 접속 IP ${signedIp}` : ''} · 이 문서는 근로자가 앱에서 직접 확인하고 서명한 전자문서입니다.
        </p>
      )}
    </article>
  )
}
