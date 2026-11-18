/**
 * 거래장부 시트 안에 붙여 넣는 '연결 다리' 코드 (Apps Script 웹 앱)
 * - 권한을 가장 좁게: @OnlyCurrentDoc (이 시트 하나만) · 외부 연결(UrlFetch) 없음 → 회사 구글 계정에서 '차단된 앱'이 덜 나옴
 * - 비밀값이 맞는 요청만: 시트 목록 · 값 읽기 · 값 쓰기 · 줄 늘리기/서식 복사/배경색
 * - 실제 쓰기 규칙(기존 줄은 안 바꾸고 맨 아래 빈 줄에만 + '🤖 해피워크 자동' 표시)은 해피워크 쪽(lib/ledger.ts)에서 지킴
 * 비밀값은 서버만 앎 (lib/gsheets proxySecret) — 회사 설정의 '연결 코드 복사'로만 꺼냄
 */
export function bridgeScript(secret: string): string {
  return `/**
 * @OnlyCurrentDoc
 * 해피워크 ↔ 거래장부 연결 (해피워크 회사 설정에서 복사한 코드 · 비밀값이 들어 있어요, 다른 사람에게 보내지 마세요)
 * 이 시트 하나만 읽고 써요 · 기존 줄을 바꾸지 않는 규칙은 해피워크가 지켜요
 * 배포: 배포 → 새 배포 → 웹 앱 · 실행 사용자 '나' · 액세스 권한 '모든 사용자'
 */
const SECRET = '${secret}'

function doPost(e) {
  let req
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}')
  } catch (err) {
    return out({ error: 'bad request' })
  }
  if (!SECRET || req.secret !== SECRET) return out({ error: 'forbidden' })
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  try {
    if (req.op === 'meta') {
      return out({ ok: ss.getSheets().map((s) => ({ title: s.getName(), id: s.getSheetId(), rows: s.getMaxRows(), cols: s.getMaxColumns() })) })
    }
    if (req.op === 'get') return out({ ok: (req.ranges || []).map((r) => read(ss, r, req.render)) })
    if (req.op === 'put') {
      const a = parse(ss, req.range)
      const v = req.values || []
      if (v.length) a.sheet.getRange(a.r1, a.c1, v.length, v[0].length).setValues(v)
      SpreadsheetApp.flush()
      return out({ ok: true })
    }
    if (req.op === 'batch') {
      ;(req.requests || []).forEach((q) => apply(ss, q))
      SpreadsheetApp.flush()
      return out({ ok: true })
    }
    return out({ error: 'not allowed' })
  } catch (err) {
    return out({ error: String((err && err.message) || err) })
  }
}

function col(s) {
  let n = 0
  for (let i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64
  return n
}

// "'05)일용직거래장부'!A6:F" → 시트 · 시작 줄/칸 · 끝 줄/칸 (끝 줄이 없으면 내용이 있는 마지막 줄)
function parse(ss, a1) {
  const m = String(a1).match(/^'?(.+?)'?!([A-Z]+)(\\d+)?(?::([A-Z]+)(\\d+)?)?$/)
  if (!m) throw new Error('bad range')
  const sheet = ss.getSheetByName(m[1])
  if (!sheet) throw new Error('no sheet')
  const c1 = col(m[2])
  const r1 = m[3] ? Number(m[3]) : 1
  const c2 = m[4] ? col(m[4]) : m[3] ? c1 : sheet.getMaxColumns()
  const r2 = m[5] ? Number(m[5]) : m[4] || !m[3] ? sheet.getLastRow() : r1
  return { sheet, r1, c1, r2, c2 }
}

function read(ss, a1, render) {
  const a = parse(ss, a1)
  if (a.r2 < a.r1) return []
  const range = a.sheet.getRange(a.r1, a.c1, a.r2 - a.r1 + 1, a.c2 - a.c1 + 1)
  let rows
  if (render === 'FORMULA') {
    const f = range.getFormulas()
    const v = range.getValues()
    rows = v.map((r, i) => r.map((c, j) => f[i][j] || (c === null ? '' : c)))
  } else rows = range.getDisplayValues()
  rows = rows.map((r) => {
    const x = r.slice()
    while (x.length && (x[x.length - 1] === '' || x[x.length - 1] === null)) x.pop()
    return x
  })
  while (rows.length && !rows[rows.length - 1].length) rows.pop()
  return rows
}

function sheetById(ss, id) {
  const s = ss.getSheets().filter((x) => x.getSheetId() === id)[0]
  if (!s) throw new Error('no sheet')
  return s
}
function grid(ss, g) {
  const s = sheetById(ss, g.sheetId)
  return s.getRange(g.startRowIndex + 1, g.startColumnIndex + 1, g.endRowIndex - g.startRowIndex, g.endColumnIndex - g.startColumnIndex)
}

function apply(ss, q) {
  if (q.appendDimension) {
    const s = sheetById(ss, q.appendDimension.sheetId)
    s.insertRowsAfter(s.getMaxRows(), q.appendDimension.length)
  } else if (q.copyPaste && q.copyPaste.pasteType === 'PASTE_FORMAT') {
    grid(ss, q.copyPaste.source).copyTo(grid(ss, q.copyPaste.destination), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false)
  } else if (q.repeatCell && q.repeatCell.fields === 'userEnteredFormat.backgroundColor') {
    const c = q.repeatCell.cell.userEnteredFormat.backgroundColor
    grid(ss, q.repeatCell.range).setBackgroundRGB(Math.round(c.red * 255), Math.round(c.green * 255), Math.round(c.blue * 255))
  } else throw new Error('not allowed')
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}
`
}
