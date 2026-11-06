// 묶음 101: 정기 개선 — 정산 탭 도구 줄
// · 급여 설정 · 정산표 엑셀 · 명세서 인쇄를 같은 크기 칸 한 줄로 (공고 화면 도구 줄과 같은 모양)
// · 실수 막기: 아직 안 끝난 근무(근무 중·퇴근 기록 없음)가 있으면 정산표 엑셀은 한 번 멈춤 '…n건은 정산표에 빠져요 / 한 번 더 누르면 그대로 받아요'
//   (한 번 더 누르면 받음) · 다 끝났으면 바로 받음
// node scripts/qa/batch101.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', acceptDownloads: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  let csvHits = 0
  a.on('request', (r) => { if (r.url().includes('/admin/export/settlement')) csvHits++ })
  const open = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=pay`); await a.locator('[data-pay-tools]').waitFor({ timeout: 10000 }).catch(() => {}) }

  // ── 1. 도구 줄 ──
  await open()
  const tiles = await a.locator('[data-pay-tools] > div > *').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), txt: e.innerText.trim() } }))
  ok("도구 줄: '급여 설정 · 정산표 엑셀 · 명세서 인쇄'", tiles.map((x) => x.txt).join(',') === '급여 설정,정산표 엑셀,명세서 인쇄', tiles.map((x) => x.txt).join(','))
  ok('같은 크기 칸 한 줄 · 글자 한 줄', tiles.length === 3 && tiles.every((x) => x.t === tiles[0].t && x.h === tiles[0].h && Math.abs(x.w - tiles[0].w) <= 1) && tiles[0].h < 70, JSON.stringify(tiles))
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 근무 중인 사람이 있으면 엑셀은 한 번 멈춤 ──
  const csv = a.locator('[data-pay-csv]')
  csvHits = 0
  await csv.click()
  await a.waitForTimeout(500)
  const warn = a.locator('[data-pay-csv-warn]')
  ok("근무 중 1명: 첫 누름은 받지 않고 '안 끝난 근무 1건은 정산표에 빠져요 / 한 번 더 누르면 그대로 받아요'", csvHits === 0 && (await warn.innerText().catch(() => '')).includes('안 끝난 근무 1건은 정산표에 빠져요') && (await csv.innerText()).includes('한 번 더 누르기'))
  ok('안내 두 줄 각 한 줄 (360px)', (await warn.locator('b, span').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height < 20))))
  const dl1 = a.waitForEvent('download', { timeout: 8000 }).then(() => true, () => false)
  await csv.click()
  ok('한 번 더 누르면 받음', (await dl1) || csvHits > 0)

  // ── 3. 다 끝났으면 바로 받음 ──
  await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`, 'PATCH', { clock_out: new Date().toISOString() })
  await open()
  csvHits = 0
  const dl2 = a.waitForEvent('download', { timeout: 8000 }).then(() => true, () => false)
  await a.locator('[data-pay-csv]').click()
  ok('안 끝난 근무가 없으면 바로 받음 (안내 없음)', ((await dl2) || csvHits > 0) && (await a.locator('[data-pay-csv-warn]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
