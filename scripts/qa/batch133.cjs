// 묶음 133 (정기 개선 2026-11-08 05:35)
// · 지난 근무: 오늘 근무 중이면 위 카드 '실수령 0원' 아래 '오늘 근무는 끝나면 더해져요' (0원이 틀린 것처럼 보이지 않게)
// · 그 달이 오늘 근무뿐이면 달 옆 합계 '0원' 대신 '계산 전'
// node scripts/qa/batch133.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  // 가짜 데이터: 근무자가 오늘 근무 중 (끝난 근무 없음)
  await w.goto(`${D}/me/history`)
  const hero = w.locator('[data-history-hero]')
  await hero.waitFor({ timeout: 15000 }).catch(() => {})
  ok("오늘 근무 중: 위 카드에 '오늘 근무는 끝나면 더해져요'", (await hero.locator('[data-hero-live]').innerText().catch(() => '')).includes('끝나면 더해져요'))
  ok("이 달이 오늘 근무뿐: 달 합계 '계산 전'", (await w.locator('[data-month-net]').first().innerText().catch(() => '')) === '계산 전')
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/history-live.png` }).catch(() => {})
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
