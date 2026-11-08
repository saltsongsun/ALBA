// 묶음 131 (정기 개선 2026-11-08 03:35)
// · 대시보드 '인원이 모자라요' 카드: 이미 시작한 행사는 '오늘 09:00 시작' 대신 '진행 중 · 09:00 시작',
//   모두 시작한 행사면 제목도 '진행 중인데 인원이 모자라요' (아직 시작 전이 하나라도 있으면 '곧 시작하는데…')
// node scripts/qa/batch131.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const card = a.locator('[data-shortage]')

  // ── 1. 오늘 00:00 시작 (이미 시작) → 진행 중 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, start_time: '00:00:00', end_time: '23:59:00' })
  await a.goto(`${D}/admin`)
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  let t = await card.innerText().catch(() => '')
  ok("이미 시작: 제목 '진행 중인데 인원이 모자라요' · '진행 중 · 00:00 시작'", t.includes('진행 중인데 인원이 모자라요') && t.includes('진행 중 · 00:00 시작'), t.replace(/\n/g, ' | '))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/shortage-live.png` }).catch(() => {})
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 오늘 23:59 시작 (아직 전) → 곧 시작 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '23:59:00', end_time: '23:59:00' })
  await a.goto(`${D}/admin`)
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  t = await card.innerText().catch(() => '')
  const before = Date.now() + 9 * 3600e3 < Date.parse(`${today}T23:59:00Z`)
  if (before) ok("아직 시작 전: '곧 시작하는데 인원이 모자라요' · '오늘 23:59 시작'", t.includes('곧 시작하는데 인원이 모자라요') && t.includes('오늘 23:59 시작'), t.replace(/\n/g, ' | '))
  else console.log('SKIP  23:59가 지나 확인 생략')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
