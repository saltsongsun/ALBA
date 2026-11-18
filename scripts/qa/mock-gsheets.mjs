// 가짜 구글 시트 (거래장부 연동 테스트용) — 토큰 · 값 읽기(한 범위/여러 범위 · 보이는 값/수식) · 값 쓰기 · batchUpdate(줄 늘리기·서식 복사·배경색)
// PORT=54399 node scripts/qa/mock-gsheets.mjs
// 테스트용: POST /_seed {tabs: {제목: {rows, cols, cells: {"6,0": 값 | {f, d}}}}} · GET /_dump · GET /_log · POST /_set {tab, cells}
import http from 'node:http'

const PORT = Number(process.env.PORT || 54399)
const SHEET = process.env.SHEET_ID || 'test-sheet'
let tabs = {}
let log = []
let nextId = 100

const colNum = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
const colLet = (i) => String.fromCharCode(65 + i)

/** "'탭'!A6:F" → {tab, r1, c1, r2, c2} (줄·칸은 0부터) */
function parseRange(range) {
  const m = range.match(/^'?(.+?)'?!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/)
  if (!m) throw new Error(`bad range ${range}`)
  const t = tabs[m[1]]
  if (!t) throw new Error(`no tab ${m[1]}`)
  const c1 = colNum(m[2])
  const r1 = m[3] ? Number(m[3]) - 1 : 0
  const c2 = m[4] ? colNum(m[4]) : m[3] && !m[4] ? c1 : t.cols - 1
  const r2 = m[5] ? Number(m[5]) - 1 : m[4] || !m[3] ? t.rows - 1 : r1
  return { tab: m[1], t, r1, c1, r2, c2 }
}

/** 수식이 보여 줄 글자 (테스트에 필요한 고유코드 수식만 흉내) */
function evalFormula(t, f) {
  const code = f.match(/^=IF\(A(\d+)="","", ?A\1 ?& ?"\(" ?& ?LEFT\(B\1, ?6\) ?& ?"\)"\)$/)
  if (code) {
    const r = Number(code[1]) - 1
    const a = shown(t, r, 0)
    return a ? `${a}(${shown(t, r, 1).slice(0, 6)})` : ''
  }
  return ''
}
function shown(t, r, c) {
  const cell = t.cells[`${r},${c}`]
  if (cell == null) return ''
  if (typeof cell === 'object') return cell.d ?? (cell.f ? evalFormula(t, cell.f) : '')
  if (typeof cell === 'boolean') return cell ? 'TRUE' : 'FALSE'
  return String(cell)
}
function raw(t, r, c) {
  const cell = t.cells[`${r},${c}`]
  if (cell == null) return ''
  if (typeof cell === 'object') return cell.f ?? cell.d ?? ''
  return cell
}

function read(range, render) {
  const { t, r1, c1, r2, c2 } = parseRange(range)
  const out = []
  for (let r = r1; r <= Math.min(r2, t.rows - 1); r++) {
    const row = []
    for (let c = c1; c <= c2; c++) row.push(render === 'FORMULA' ? raw(t, r, c) : shown(t, r, c))
    while (row.length && (row[row.length - 1] === '' || row[row.length - 1] == null)) row.pop()
    out.push(row)
  }
  while (out.length && out[out.length - 1].length === 0) out.pop()
  return out
}

function write(range, values) {
  const { tab, t, r1, c1 } = parseRange(range)
  values.forEach((row, i) => {
    if (r1 + i >= t.rows) throw Object.assign(new Error(`Range (${range}) exceeds grid limits. Max rows: ${t.rows}`), { code: 400 })
    row.forEach((v, j) => {
      const key = `${r1 + i},${c1 + j}`
      if (typeof v === 'string' && v.startsWith('=')) t.cells[key] = { f: v }
      else if (typeof v === 'string' && v.startsWith("'")) t.cells[key] = v.slice(1)
      else if (v === '' || v == null) delete t.cells[key]
      else if (v === 'TRUE' || v === 'FALSE') t.cells[key] = v === 'TRUE'
      else t.cells[key] = v
    })
  })
  log.push({ op: 'write', tab, range, rows: values.length })
}

function batchUpdate(reqs) {
  const byId = (id) => Object.entries(tabs).find(([, t]) => t.id === id)
  for (const q of reqs) {
    if (q.appendDimension) {
      const [tab, t] = byId(q.appendDimension.sheetId)
      t.rows += q.appendDimension.length
      log.push({ op: 'appendDimension', tab, length: q.appendDimension.length })
    } else if (q.copyPaste) {
      const [tab] = byId(q.copyPaste.source.sheetId)
      log.push({ op: 'copyPaste', tab, from: q.copyPaste.source.startRowIndex + 1, to: [q.copyPaste.destination.startRowIndex + 1, q.copyPaste.destination.endRowIndex], type: q.copyPaste.pasteType })
    } else if (q.repeatCell) {
      const [tab, t] = byId(q.repeatCell.range.sheetId)
      const bg = q.repeatCell.cell?.userEnteredFormat?.backgroundColor
      for (let r = q.repeatCell.range.startRowIndex; r < q.repeatCell.range.endRowIndex; r++) t.bg[r + 1] = bg
      log.push({ op: 'repeatCell', tab, rows: [q.repeatCell.range.startRowIndex + 1, q.repeatCell.range.endRowIndex], fields: q.repeatCell.fields })
    } else throw Object.assign(new Error(`unknown request ${Object.keys(q)[0]}`), { code: 400 })
  }
}

const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => ok(b)) })
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
      const p = decodeURIComponent(url.pathname)
      if (p === '/token' && req.method === 'POST') {
        const b = new URLSearchParams(await body(req))
        if ((b.get('assertion') ?? '').split('.').length !== 3) return send(res, 400, { error: 'bad jwt' })
        return send(res, 200, { access_token: 'tok', expires_in: 3600 })
      }
      if (p === '/_seed') {
        const j = JSON.parse(await body(req))
        tabs = {}
        log = []
        for (const [title, t] of Object.entries(j.tabs)) tabs[title] = { id: nextId++, rows: t.rows, cols: t.cols, cells: { ...t.cells }, bg: {} }
        return send(res, 200, { ok: true })
      }
      if (p === '/_set') {
        const j = JSON.parse(await body(req))
        if (j.rows) tabs[j.tab].rows = j.rows
        for (const [k, v] of Object.entries(j.cells ?? {})) v === null ? delete tabs[j.tab].cells[k] : (tabs[j.tab].cells[k] = v)
        return send(res, 200, { ok: true })
      }
      if (p === '/_dump') return send(res, 200, tabs)
      if (p === '/_log') return send(res, 200, log)
      if (req.headers.authorization !== 'Bearer tok') return send(res, 401, { error: 'no token' })
      const base = `/v4/spreadsheets/${SHEET}`
      if (p === base && req.method === 'GET') {
        return send(res, 200, { sheets: Object.entries(tabs).map(([title, t]) => ({ properties: { sheetId: t.id, title, gridProperties: { rowCount: t.rows, columnCount: t.cols } } })) })
      }
      if (p === `${base}/values:batchGet`) {
        const render = url.searchParams.get('valueRenderOption')
        log.push({ op: 'batchGet', ranges: url.searchParams.getAll('ranges') })
        return send(res, 200, { valueRanges: url.searchParams.getAll('ranges').map((r) => ({ range: r, values: read(r, render) })) })
      }
      if (p.startsWith(`${base}/values/`)) {
        const range = p.slice(`${base}/values/`.length)
        if (req.method === 'GET') {
          log.push({ op: 'get', range, render: url.searchParams.get('valueRenderOption') })
          return send(res, 200, { range, values: read(range, url.searchParams.get('valueRenderOption')) })
        }
        if (req.method === 'PUT') {
          write(range, JSON.parse(await body(req)).values)
          return send(res, 200, { updatedRange: range })
        }
      }
      if (p === `${base}:batchUpdate` && req.method === 'POST') {
        batchUpdate(JSON.parse(await body(req)).requests)
        return send(res, 200, { replies: [] })
      }
      send(res, 404, { error: `not found ${p}` })
    } catch (e) {
      send(res, e.code ?? 500, { error: String(e.message ?? e) })
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`mock gsheets on ${PORT}`))
