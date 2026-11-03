// 묶음 20: 오늘 근무 카드 '🎒 챙길 것 체크'(복장·준비물을 하나씩 눌러 체크, 이 휴대폰에 기억, 다 챙기면 '준비 끝!')
// node scripts/qa/batch20.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  await w.goto(`${D}/me`)
  ok('복장·준비물이 없으면 체크 목록 없음', (await w.locator('[data-prep-checklist]').count()) === 0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { dress_code: '검은 바지, 운동화', supplies: '신분증 · 보조배터리' })
  await w.reload()
  await w.waitForLoadState('networkidle').catch(() => {})
  const box = w.locator('[data-prep-checklist]').first()
  const btns = box.locator('button')
  ok('챙길 것 4개, 0/4', (await btns.count()) === 4 && (await box.locator('[data-prep-count]').innerText()).trim() === '0/4', await box.innerText().catch(() => ''))
  await btns.nth(0).click()
  await btns.nth(2).click()
  ok('누르면 체크 2/4', (await box.locator('[data-prep-count]').innerText()).trim() === '2/4' && (await btns.nth(0).getAttribute('aria-pressed')) === 'true')
  await w.reload()
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.waitForTimeout(300)
  ok('새로 고쳐도 기억 2/4', (await w.locator('[data-prep-checklist] [data-prep-count]').first().innerText()).trim() === '2/4')
  const b2 = w.locator('[data-prep-checklist]').first().locator('button')
  await b2.nth(1).click()
  await b2.nth(3).click()
  ok('다 챙기면 ✅ 준비 끝!', (await w.locator('[data-prep-checklist]').first().innerText()).includes('준비 끝'))
  await b2.nth(3).click()
  ok('다시 누르면 체크 풀림 3/4', (await w.locator('[data-prep-checklist] [data-prep-count]').first().innerText()).trim() === '3/4')
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
