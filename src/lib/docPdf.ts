import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { fmtDateLong, kstDate, kstDateTime } from './time'
import type { CompanySnapshot } from './types'

/**
 * 서류 PDF: 화면의 서류(DocSheet)와 같은 내용·순서로 A4 PDF를 만듦 (인쇄·보관용).
 * 서식은 화면과 같이 '# 제목', '## 소제목', '- 목록', 그 밖은 문단만 씀.
 * 글꼴은 한글이 들어간 Noto Sans KR(한글·영문·기호만 남긴 부분 글꼴)을 통째로 넣음 (글자가 깨지지 않게).
 * 여러 서류를 한 파일로 묶을 때는 서류마다 새 쪽에서 시작하고, 쪽 번호는 서류마다 따로 셈
 */

export type PdfDoc = {
  id: string
  title: string
  body: string
  company: CompanySnapshot
  seal: string | null
  worker: { name: string; birth_date: string | null; phone: string }
  signature: string | null
  signedAt: string | null
  signedIp: string | null
  status: 'pending' | 'signed' | 'void'
  parties: 'labor' | 'service'
}

const A4 = { w: 595.28, h: 841.89 }
const MX = 56
const TOP = 60
const BOTTOM = 64
const INK = rgb(0.09, 0.1, 0.13)
const SUB = rgb(0.38, 0.4, 0.45)
const MUTE = rgb(0.55, 0.57, 0.62)
const RED = rgb(0.86, 0.15, 0.27)

let fontBytes: Promise<[Buffer, Buffer]> | null = null
function loadFonts(): Promise<[Buffer, Buffer]> {
  const dir = path.join(process.cwd(), 'src/fonts/pdf')
  fontBytes ??= Promise.all([readFile(path.join(dir, 'NotoSansKR-Regular.ttf')), readFile(path.join(dir, 'NotoSansKR-Bold.ttf'))]).catch((e) => {
    fontBytes = null
    throw e
  })
  return fontBytes
}

/** 글꼴에 없는 글자(한자·그림 문자 등)는 □로 (PDF가 깨지지 않게) */
let glyphCheck: ((cp: number) => boolean) | null = null
function clean(s: string): string {
  if (!glyphCheck) return s
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    out += cp < 0x20 ? ' ' : glyphCheck(cp) ? ch : '□'
  }
  return out
}

/** 단어(띄어쓰기) 단위로 줄을 나누고, 한 단어가 줄보다 길면 글자 단위로 나눔 */
function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const width = (t: string) => font.widthOfTextAtSize(t, size)
  const lines: string[] = []
  let line = ''
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue
    const next = line + part
    if (width(next) <= max) {
      line = next
      continue
    }
    if (line.trim()) lines.push(line.trimEnd())
    line = part.trimStart()
    while (line && width(line) > max) {
      let i = line.length - 1
      while (i > 1 && width(line.slice(0, i)) > max) i--
      lines.push(line.slice(0, i))
      line = line.slice(i)
    }
  }
  if (line.trim() || !lines.length) lines.push(line.trimEnd())
  return lines
}

function parseImage(dataUrl: string | null): { kind: 'png' | 'jpg'; bytes: Buffer } | null {
  const m = dataUrl?.match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/)
  if (!m) return null
  return { kind: m[1] === 'png' ? 'png' : 'jpg', bytes: Buffer.from(m[2], 'base64') }
}

class Writer {
  page!: PDFPage
  y = 0
  pages: PDFPage[] = []
  constructor(
    private pdf: PDFDocument,
    readonly r: PDFFont,
    readonly b: PDFFont,
  ) {}
  newPage() {
    this.page = this.pdf.addPage([A4.w, A4.h])
    this.pages.push(this.page)
    this.y = A4.h - TOP
  }
  /** 남은 자리가 h보다 작으면 다음 쪽으로 */
  ensure(h: number) {
    if (this.y - h < BOTTOM) this.newPage()
  }
  text(
    s: string,
    o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: 'left' | 'center'; indent?: number; lh?: number; before?: number; after?: number; max?: number } = {},
  ) {
    const size = o.size ?? 10.5
    const font = o.bold ? this.b : this.r
    const lh = size * (o.lh ?? 1.65)
    const x0 = MX + (o.indent ?? 0)
    const max = o.max ?? A4.w - MX - x0
    this.y -= o.before ?? 0
    for (const line of wrap(clean(s), font, size, max)) {
      this.ensure(lh)
      const w = font.widthOfTextAtSize(line, size)
      const x = o.align === 'center' ? (A4.w - w) / 2 : x0
      this.page.drawText(line, { x, y: this.y - size, size, font, color: o.color ?? INK })
      this.y -= lh
    }
    this.y -= o.after ?? 0
  }
}

/** 서류 여러 건을 한 PDF로 (서류마다 새 쪽 · 서류마다 쪽 번호) */
export async function docsToPdf(docs: PdfDoc[], meta: { title: string }): Promise<Uint8Array> {
  const [regular, bold] = await loadFonts()
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  // 글꼴은 통째로 넣음: pdf-lib의 '쓴 글자만 넣기(subset)'는 한글 글꼴에서 글자 모양이 빠져 대부분 비어 보임 (파일은 1~2MB)
  const r = await pdf.embedFont(regular, { subset: false })
  const b = await pdf.embedFont(bold, { subset: false })
  if (!glyphCheck) {
    const fk = fontkit.create(regular)
    glyphCheck = (cp) => fk.hasGlyphForCodePoint(cp)
  }
  pdf.setTitle(meta.title)
  pdf.setCreator('해피워크')
  pdf.setProducer('해피워크')
  pdf.setLanguage('ko-KR')

  // 같은 직인·서명 그림은 한 번만 넣음
  const images = new Map<string, Promise<PDFImage | null>>()
  const image = (src: string | null) => {
    if (!src) return Promise.resolve(null)
    if (!images.has(src)) {
      const img = parseImage(src)
      images.set(src, img ? (img.kind === 'png' ? pdf.embedPng(img.bytes) : pdf.embedJpg(img.bytes)).catch(() => null) : Promise.resolve(null))
    }
    return images.get(src)!
  }

  for (const doc of docs) {
    const w = new Writer(pdf, r, b)
    w.newPage()
    if (doc.status === 'void') w.text('무효 처리된 서류예요', { size: 10, bold: true, color: RED, after: 6 })
    if (doc.status === 'pending') w.text('서명 전 (아직 서명하지 않은 서류)', { size: 10, bold: true, color: RED, after: 6 })

    // 본문: '# ', '## ', '- ', 문단
    for (const raw of doc.body.split('\n')) {
      const line = raw.trimEnd()
      if (!line.trim()) continue
      if (line.startsWith('# ')) w.text(line.slice(2), { size: 18, bold: true, align: 'center', lh: 1.4, after: 14 })
      else if (line.startsWith('## ')) w.text(line.slice(3), { size: 11.5, bold: true, before: 8, after: 1 })
      else if (line.startsWith('- ')) {
        const startY = w.y
        w.text(line.slice(2), { indent: 14 })
        // 첫 줄 앞에 점 (줄이 다음 쪽으로 넘어간 경우는 그 쪽 첫 줄 기준)
        const dotY = w.y < startY ? startY : w.y
        w.page.drawCircle({ x: MX + 5, y: dotY - 10.5 * 0.62, size: 1.6, color: INK })
      } else w.text(line, {})
    }

    // 날짜 + 당사자 (사업주 / 근로자)
    const [labelA, labelB] = doc.parties === 'service' ? ['(갑 · 발주자)', '(을 · 수급인)'] : ['(사업주)', '(근로자)']
    w.text(fmtDateLong(doc.signedAt ? kstDate(doc.signedAt) : kstDate()), { size: 11, bold: true, align: 'center', before: 20, after: 18 })
    const colW = (A4.w - MX * 2 - 24) / 2
    const left: string[] = [`상호: ${doc.company.company_name}`]
    if (doc.company.business_no) left.push(`사업자등록번호: ${doc.company.business_no}`)
    if (doc.company.company_address) left.push(`주소: ${doc.company.company_address}`)
    if (doc.company.company_phone) left.push(`전화: ${doc.company.company_phone}`)
    const right: string[] = [`성명: ${doc.worker.name}`]
    if (doc.worker.birth_date) right.push(`생년월일: ${fmtDateLong(doc.worker.birth_date)}`)
    right.push(`연락처: ${doc.worker.phone}`)
    const size = 10
    const lh = size * 1.7
    const lines = (arr: string[]) => arr.flatMap((s) => wrap(clean(s), r, size, colW))
    const L = lines(left)
    const R = lines(right)
    // 마지막 줄(대표자 / 서명) + 직인·서명 그림 자리까지 한 쪽에 들어가게
    const rows = Math.max(L.length, R.length) + 2
    w.ensure(rows * lh + 40)
    const top = w.y
    const xA = MX
    const xB = MX + colW + 24
    w.page.drawText(clean(labelA), { x: xA, y: top - size, size, font: b, color: INK })
    w.page.drawText(clean(labelB), { x: xB, y: top - size, size, font: b, color: INK })
    L.forEach((s, i) => w.page.drawText(s, { x: xA, y: top - lh * (i + 1) - size, size, font: r, color: INK }))
    R.forEach((s, i) => w.page.drawText(s, { x: xB, y: top - lh * (i + 1) - size, size, font: r, color: INK }))
    // 대표자 … (인) + 직인 (‘(인)’ 한가운데에)
    const yCeo = top - lh * (L.length + 1) - size
    const ceo = clean(`대표자: ${doc.company.ceo_name ?? ''} `)
    w.page.drawText(ceo, { x: xA, y: yCeo, size, font: r, color: INK })
    const inX = xA + r.widthOfTextAtSize(ceo, size)
    const inW = r.widthOfTextAtSize('(인)', size)
    w.page.drawText('(인)', { x: inX, y: yCeo, size, font: r, color: MUTE })
    const seal = await image(doc.seal)
    if (seal) {
      const s = 44
      const k = Math.min(s / seal.width, s / seal.height)
      const sw = seal.width * k
      const sh = seal.height * k
      w.page.drawImage(seal, { x: inX + inW / 2 - sw / 2, y: yCeo + size * 0.35 - sh / 2, width: sw, height: sh })
    }
    // 서명: + 서명 그림
    const ySign = top - lh * (R.length + 1) - size
    w.page.drawText('서명:', { x: xB, y: ySign, size, font: r, color: INK })
    const sig = await image(doc.signature)
    if (sig) {
      const bw = 120
      const bh = 46
      const k = Math.min(bw / sig.width, bh / sig.height)
      w.page.drawImage(sig, { x: xB + r.widthOfTextAtSize('서명: ', size), y: ySign - 14, width: sig.width * k, height: sig.height * k })
    } else {
      w.page.drawText('(서명 전)', { x: xB + r.widthOfTextAtSize('서명: ', size), y: ySign, size, font: r, color: MUTE })
    }
    w.y = Math.min(yCeo, ySign) - 30

    // 전자서명 기록
    if (doc.signedAt) {
      w.ensure(40)
      w.page.drawLine({ start: { x: MX, y: w.y }, end: { x: A4.w - MX, y: w.y }, thickness: 0.5, color: rgb(0.88, 0.89, 0.91) })
      w.y -= 8
      const who = doc.parties === 'service' ? '수급인' : '근로자'
      w.text(
        `전자서명 일시 ${kstDateTime(doc.signedAt)} · 문서번호 ${doc.id.slice(0, 8).toUpperCase()}${doc.signedIp ? ` · 접속 IP ${doc.signedIp}` : ''} · 이 문서는 ${who}이 앱에서 직접 확인하고 서명한 전자문서입니다.`,
        { size: 7.5, color: SUB, lh: 1.5 },
      )
    }

    // 쪽 번호 (이 서류 안에서)
    const n = w.pages.length
    w.pages.forEach((p, i) => {
      const label = clean(`${doc.title} · ${doc.worker.name} · ${i + 1}/${n}`)
      const lw = r.widthOfTextAtSize(label, 7.5)
      p.drawText(label, { x: (A4.w - lw) / 2, y: 30, size: 7.5, font: r, color: MUTE })
    })
  }
  if (!docs.length) {
    const page = pdf.addPage([A4.w, A4.h])
    page.drawText('서류가 없어요', { x: MX, y: A4.h - TOP - 12, size: 12, font: r, color: SUB })
  }
  return pdf.save()
}

/** 내려받는 파일 이름 (한글은 filename*, 영문 대체 이름도 함께) */
export function pdfResponse(bytes: Uint8Array, name: string): Response {
  const safe = name.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 120) || 'document'
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="documents.pdf"; filename*=UTF-8''${encodeURIComponent(`${safe}.pdf`)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
