// 묶음 138 (정기 개선 2026-11-08 10:35)
// · 관리자 공고 목록(휴대폰 카드): 오늘 하는 행사는 '오늘', 내일 시작은 '내일' 배지 (현장에서 지금 볼 공고를 바로 찾게)
// node scripts/qa/batch138.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000001b8'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)

;(async () => {
  // 내일 시작하는 공고 하나 더 (오늘 공고는 가짜 데이터 그대로)
  const [job] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...job, id: J2, title: '내일 시작 행사 스태프', start_date: day(1), end_date: day(1), created_at: new Date().toISOString() })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/jobs`)
  const card = (id) => a.locator(`a[href="/admin/jobs/${id}"]`).first()
  await card(J).waitFor({ timeout: 15000 }).catch(() => {})
  ok("오늘 하는 공고: '오늘' 배지", (await card(J).locator('[data-day-tag]').innerText().catch(() => '')) === '오늘')
  ok("내일 시작 공고: '내일' 배지", (await card(J2).locator('[data-day-tag]').innerText().catch(() => '')) === '내일')
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await a.locator('.stagger').first().screenshot({ path: `${SHOTS}/day-tags.png` }).catch(() => {})
  await a.goto(`${D}/admin/jobs?tab=past`)
  await a.locator('main').waitFor()
  ok("지난 공고 탭에는 배지 없음", (await a.locator('[data-day-tag]').count()) === 0)
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
