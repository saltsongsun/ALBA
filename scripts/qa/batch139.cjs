// 묶음 139 (정기 개선 2026-11-08 11:35)
// · 근무자 명단 '명단 열림 · n분 뒤 잠김' 바: 열어 둔 채로 두면 남은 시간이 멈춰 있고 시간이 지나도 명단이 계속 보이던 것
//   → 30초마다 줄어들고, 0이 되면 화면을 새로 받아 잠금 화면으로 (잠금 확인은 서버가 그대로)
// node scripts/qa/batch139.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
// 명단을 연 지 오래돼 35초만 남은 상태
const roster = (u, sec) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + sec })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A, 35), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/workers`)
  const bar = a.locator('[data-roster-open]')
  await bar.waitFor({ timeout: 15000 }).catch(() => {})
  ok("명단 열림 바: '1분 뒤 잠김'", (await bar.innerText().catch(() => '')).includes('1분 뒤 잠김'))
  // 35초가 지나면 저절로 잠금 화면으로
  const locked = await a.locator('[data-roster-lock]').waitFor({ timeout: 50000 }).then(() => true, () => false)
  ok('시간이 다 되면 손대지 않아도 잠금 화면으로 (명단이 계속 보이지 않음)', locked && (await bar.count()) === 0 && !(await a.locator('main').innerText()).includes('010-'))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/roster-locked.png` }).catch(() => {})
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
