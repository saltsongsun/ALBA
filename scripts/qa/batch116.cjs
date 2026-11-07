// 묶음 116 (정기 개선 2026-11-07 09:35 · 디자인 원칙 "많은 정보도 심플하게")
// · 외주 관리: 아무것도 없으면 숫자 0 칸 네 개 없이 '업체부터 등록' 한 단계만 · 있으면 카드 하나
//   (지급할 금액만 크게 + '진행 중 견적 n' · '지급일 지남 n' · '계산서 안 받음 n' 짧은 칩) · 위 설명 한 줄
// · 대금 지급: '계산서 안 받은 업체 n곳 [문자로 계산서 요청]' (받는 사람·문구·우리 사업자번호를 채운 채 문자 앱이 열림)
// node scripts/qa/batch116.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', C = '99999999-0000-4000-8000-000000000099'
const V1 = 'dddddddd-0000-4000-8000-0000000001d1', V2 = 'dddddddd-0000-4000-8000-0000000001d2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const yesterday = new Date(Date.now() + 9 * 3600e3 - 864e5).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const wide = () => a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 아무것도 없을 때: 숫자 0 칸 없음 ──
  await a.goto(`${D}/admin/vendors`)
  await a.locator('h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("처음 회사: 숫자 0 칸들 없이 '업체부터 등록' 한 단계만", (await a.locator('[data-vendor-summary]').count()) === 0 && (await a.locator('[data-vendor-first]').count()) === 1)
  const desc = a.locator('h1 + p')
  ok("위 설명 한 줄: '견적 비교 · 대금 지급 · 세금계산서를 한곳에서'", (await desc.innerText()).trim() === '견적 비교 · 대금 지급 · 세금계산서를 한곳에서' && (await desc.evaluate((el) => el.getClientRects().length === 1)))

  // ── 2. 업체 둘 · 지급 둘(하나는 계산서 안 받음·지급일 지남) · 진행 중 견적 하나 ──
  const base = { company_id: C, user_id: null, category: '음향', contact_name: '담당', email: null, business_no: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: '2026-11-01T00:00:00Z' }
  await rest('vendors', 'POST', { ...base, id: V1, name: '한빛음향', phone: '01050000001' })
  await rest('vendors', 'POST', { ...base, id: V2, name: '두리렌탈', phone: '01050000002' })
  const pay = { company_id: C, job_id: null, quote_id: null, vat_included: true, paid_at: null, memo: null, created_at: '2026-11-02T00:00:00Z' }
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000000001e1', vendor_id: V1, title: '무대 음향', amount: 1500000, due_date: yesterday, invoice_at: null })
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000000001e2', vendor_id: V2, title: '천막', amount: 500000, due_date: null, invoice_at: `${today}T00:00:00Z` })
  await rest('quote_requests', 'POST', { company_id: C, id: 'dddddddd-0000-4000-8000-0000000001f1', job_id: null, title: '조명 견적', details: null, due_date: null, status: 'open', created_by: A, created_at: '2026-11-03T00:00:00Z' })

  await a.goto(`${D}/admin/vendors`)
  const sum = a.locator('[data-vendor-summary]')
  await sum.waitFor({ timeout: 15000 }).catch(() => {})
  const st = (await sum.innerText().catch(() => '')).replace(/\n/g, ' | ')
  ok("카드 하나: '지급할 금액 2,000,000원'", st.includes('지급할 금액') && st.includes('2,000,000원'), st)
  const chips = await a.locator('[data-vendor-chip]').evaluateAll((els) => els.map((e) => e.innerText.trim()))
  ok("칩 셋: '진행 중 견적 1' · '지급일 지남 1' · '계산서 안 받음 1'", chips.join(',') === '진행 중 견적 1,지급일 지남 1,계산서 안 받음 1', chips.join(','))
  ok('칩 한 줄 · 카드 낮게 (360px)', (await a.locator('[data-vendor-chip]').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size === 1)) && (await sum.evaluate((el) => el.getBoundingClientRect().height < 110)))
  ok('360px: 옆으로 안 밀림 (외주 관리)', await wide())
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/vendors.png` })

  // ── 3. 대금 지급: 계산서 안 받은 업체에 한 번에 요청 ──
  await a.goto(`${D}/admin/vendors?tab=pay`)
  const ask = a.locator('[data-invoice-ask]')
  await ask.waitFor({ timeout: 15000 }).catch(() => {})
  const href = decodeURIComponent((await ask.getByRole('link', { name: '문자로 계산서 요청' }).getAttribute('href').catch(() => '')) ?? '')
  ok("'계산서 안 받은 업체 1곳 · 문자로 계산서 요청' 한 줄", (await ask.innerText().catch(() => '')).includes('계산서 안 받은 업체 1곳') && href.startsWith('sms:') && (await ask.evaluate((el) => el.getBoundingClientRect().height < 56)), href.slice(0, 60))
  ok('받는 사람: 계산서 안 보낸 업체만 (한빛음향 O · 두리렌탈 X)', href.includes('01050000001') && !href.includes('01050000002'))
  ok("문구: '[주식회사 테스트] 대금 건 세금계산서 발행을 부탁드려요' + 우리 사업자등록번호", href.includes('[주식회사 테스트] 대금 건 세금계산서 발행을 부탁드려요') && /사업자등록번호 [\d-]{10,12}/.test(href), href.slice(href.indexOf('body')).slice(0, 120))
  ok('360px: 옆으로 안 밀림 (대금 지급)', await wide())
  if (SHOTS) await ask.screenshot({ path: `${SHOTS}/invoice-ask.png` }).catch(() => {})

  // ── 4. 계산서를 다 받으면 요청 줄 없음 ──
  await rest('vendor_payments?id=eq.dddddddd-0000-4000-8000-0000000001e1', 'PATCH', { invoice_at: `${today}T01:00:00Z` })
  await a.goto(`${D}/admin/vendors?tab=pay`)
  await a.locator('h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('계산서를 다 받으면 요청 줄 없음', (await ask.count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
