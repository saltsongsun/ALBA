// 묶음 21: '다음 근무' 카드에서도 전날 미리 '🎒 챙길 것 체크' (카드 안 '공고 보기'로 공고 이동)
// node scripts/qa/batch21.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const tomorrow = kst(1)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: tomorrow, end_date: tomorrow, dress_code: '흰 티셔츠, 운동화', supplies: '신분증' })
  await fetch(`${MD}/rest/v1/attendance?job_id=eq.${J}`, { method: 'DELETE' })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))

  await w.goto(`${D}/me`)
  await w.waitForLoadState('networkidle').catch(() => {})
  const card = w.locator('[data-next-work]')
  ok('다음 근무 카드: 내일', (await card.count()) === 1 && (await card.innerText()).includes('내일'))
  const box = card.locator('[data-prep-checklist]')
  ok('다음 근무 카드에도 챙길 것 체크 (3개)', (await box.locator('button').count()) === 3)
  await box.locator('button').nth(1).click()
  ok('체크 1/3', (await box.locator('[data-prep-count]').innerText()).trim() === '1/3')
  await w.reload()
  await w.waitForLoadState('networkidle').catch(() => {})
  await w.waitForTimeout(300)
  ok('새로 고쳐도 1/3', (await w.locator('[data-next-work] [data-prep-count]').innerText()).trim() === '1/3')
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await w.locator('[data-next-work]').getByRole('link', { name: '공고 보기 →' }).click()
  await w.waitForURL(new RegExp(`/jobs/${J}`), { timeout: 8000 }).catch(() => {})
  ok("'공고 보기'로 공고 화면", w.url().includes(`/jobs/${J}`))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
