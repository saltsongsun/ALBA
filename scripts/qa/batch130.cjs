// 묶음 130 (정기 개선 2026-11-08 02:35)
// · 공고 화면 '장소' 줄 옆 '지도 ↓' → 설명 아래 멀리 있던 '찾아오는 길'(지도·길찾기)로 바로 내려감 + 한 번 반짝
// node scripts/qa/batch130.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  for (const [who, uid] of [['근무자', W], ['비회원', null]]) {
    const p = await pg(uid)
    await p.goto(`${D}/jobs/${J}`)
    const link = p.locator('[data-venue-link]')
    await link.waitFor({ timeout: 15000 }).catch(() => {})
    ok(`${who}: '장소' 옆 '지도 ↓'`, (await link.getAttribute('href').catch(() => '')) === '#venue' && (await link.innerText().catch(() => '')).includes('지도'))
    if (who === '근무자' && SHOTS) await link.locator('xpath=ancestor::div[1]').screenshot({ path: `${SHOTS}/venue-link.png` }).catch(() => {})
    await link.click()
    await p.waitForTimeout(900)
    const r = await p.locator('#venue').evaluate((el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), target: el.matches(':target') } })
    ok(`${who}: 누르면 '찾아오는 길'이 화면 위쪽에 · 반짝 표시(:target)`, new URL(p.url()).hash === '#venue' && r.top >= 0 && r.top < 260 && r.target, JSON.stringify(r))
    ok(`${who}: 360px 옆으로 안 밀림`, await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  }
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
