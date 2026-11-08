// 묶음 134 (정기 개선 2026-11-08 06:35)
// · 내 정보 '커뮤니티 별명': 아직 별명이 없으면 빈 칸에 예시('예: 주차왕 (2~12자)') + 버튼 '정하기' (없는데 '바꾸기'라 헷갈리던 것)
//   정한 뒤에는 그대로 '바꾸기'
// node scripts/qa/batch134.cjs <default 앱> <default 가짜> <shots>
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
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  await rest(`users?id=eq.${W}`, 'PATCH', { nickname: null })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await w.goto(`${D}/me/profile#nickname`)
  const nf = w.locator('[data-nickname-form]')
  await nf.waitFor({ timeout: 15000 }).catch(() => {})
  const input = nf.locator('input[name=nickname]')
  ok("별명 없음: 빈 칸 예시 '예: 주차왕 (2~12자)' · 버튼 '정하기'", (await input.getAttribute('placeholder')) === '예: 주차왕 (2~12자)' && (await nf.getByRole('button', { name: '정하기' }).count()) === 1 && (await nf.getByRole('button', { name: '바꾸기' }).count()) === 0)
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) { await nf.evaluate((el) => el.scrollIntoView({ block: 'center' })); await nf.screenshot({ path: `${SHOTS}/nickname-empty.png` }).catch(() => {}) }
  await input.fill('행사왕')
  await nf.getByRole('button', { name: '정하기' }).click()
  await w.getByText(/행사왕/).first().waitFor({ timeout: 10000 }).catch(() => {})
  await w.waitForTimeout(800)
  ok('저장됨', (await rest(`users?id=eq.${W}`))[0]?.nickname === '행사왕')
  await w.goto(`${D}/me/profile#nickname`)
  await nf.waitFor({ timeout: 15000 }).catch(() => {})
  ok("정한 뒤: 값 '행사왕' · 버튼 '바꾸기'", (await input.inputValue()) === '행사왕' && (await nf.getByRole('button', { name: '바꾸기' }).count()) === 1)
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
