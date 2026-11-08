// 묶음 132 (정기 개선 2026-11-08 04:35)
// · 관리자 지원자 탭: '대기' 목록 배지가 근무자 화면 말 '지원완료' 대신 '확정 대기' (근무자 화면은 그대로 '지원완료')
// node scripts/qa/batch132.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await a.getByText('확정 대기').first().waitFor({ timeout: 15000 }).catch(() => {})
  const main = await a.locator('main').innerText()
  ok("관리자 지원자 탭: 대기 중인 지원자 배지 '확정 대기'", main.includes('확정 대기'))
  ok("'지원완료'(근무자 화면 말)는 관리자 화면에 안 보임", !main.includes('지원완료'))
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) {
    const badge = a.getByText('확정 대기').first()
    await badge.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await badge.locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " card ")][1]').screenshot({ path: `${SHOTS}/apps-badge.png` }).catch(() => {})
  }
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
