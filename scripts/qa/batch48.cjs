// 묶음 48: 외주 견적 링크 화면 — 해피워크가 확인한 회사면 '✓ 확인된 회사' (처음 받는 업체가 믿고 견적을 내게) · 아니면 없음
//          · 금액을 쓰는 대로 '1,500,000원 · 150만 원' (큰 금액의 0 자리 실수를 바로 알게) · 1만 원 미만은 그대로 · 360px
// node scripts/qa/batch48.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const [D, MD] = process.argv.slice(2)
const C1 = '99999999-0000-4000-8000-000000000099'
const V1 = 'eeeeeeee-0000-4000-8000-0000000000f1', R1 = 'eeeeeeee-0000-4000-8000-0000000000f3', Q1 = 'eeeeeeee-0000-4000-8000-0000000000f4'
const TOKEN = 'quoteTokenForBatch48abcdefghijklmn'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const now = new Date().toISOString()
  await rest('vendors', 'POST', { id: V1, company_id: C1, name: '일번음향상사', category: '음향', contact_name: '김음향', phone: '010-7171-7272', email: null, business_no: null, account_holder: null, memo: null, bank_name: null, bank_account_enc: null, active: true, created_at: now })
  await rest('quote_requests', 'POST', { id: R1, company_id: C1, title: '무대 음향 장비 2일', details: '메인 스피커 4조, 무선마이크 6개', due_date: null, job_id: null, status: 'open', created_at: now })
  await rest('quotes', 'POST', { id: Q1, request_id: R1, vendor_id: V1, company_id: C1, token: TOKEN, status: 'requested', amount: null, vat_included: true, note: null, submitted_at: null, created_at: now })
  await rest(`companies?id=eq.${C1}`, 'PATCH', { verified: true })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await p.goto(`${D}/quote/${TOKEN}`)
  await p.locator('input[name=amount]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("확인된 회사: '✓ 확인된 회사'", (await p.locator('[data-quote-verified]').count()) === 1 && (await p.locator('header').innerText()).includes('주식회사 테스트'))
  const amt = p.locator('input[name=amount]')
  await amt.fill('1500000')
  const read = p.locator('[data-amount-read]')
  ok("금액: '1,500,000원 · 150만 원'", (await read.innerText()).replace(/\s+/g, ' ') === '1,500,000원 · 150만 원', await read.innerText())
  await amt.fill('123456789')
  ok("큰 금액: '1억 2,345만 6,789원'", (await read.innerText()).includes('1억 2,345만 6,789원'), await read.innerText())
  await amt.fill('9500')
  ok("1만 원 미만은 '9,500원'만", (await read.innerText()).trim() === '9,500원', await read.innerText())
  ok('360px: 옆으로 안 밀림 (견적 화면)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 확인 전 회사면 배지 없음
  await rest(`companies?id=eq.${C1}`, 'PATCH', { verified: false })
  await p.goto(`${D}/quote/${TOKEN}`)
  await p.locator('input[name=amount]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('확인 전 회사: 배지 없음', (await p.locator('[data-quote-verified]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
