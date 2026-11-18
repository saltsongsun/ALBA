// 묶음 267 (정기 개선 2026-11-16 00:35 KST)
// · 외주 업체 '견적·대금': 계산서를 아직 안 받은 대금 줄 '세금계산서 발행 필요 · 알리기 ›'
//   → 그 회사 문의함이 열리고 빠른 답장에 '세금계산서를 보냈어요. 개막식 음향 · 1,500,000원' (대화가 없던 회사도 — 나를 외주사로 등록한 회사면)
//   보낸 뒤엔 '✓ 계산서 보냈다고 알렸어요 · 확인 전' · 회사가 받음을 누르면 '세금계산서 접수됨'
// · 회사 관리자 문의 화면: 그 글이 오면 '🧾 세금계산서를 보냈대요 · 개막식 음향 · 1,500,000원 [계산서 받음]' → 누르면 '✓ 계산서 받음'
//   (외주 관리 화면을 찾아가 그 대금을 고르지 않게 · 이 회사·그 업체 대금만)
// · 다른 회사 대금 번호를 넣거나 외주사가 아닌 사람이면 글이 채워지지 않음
// node scripts/qa/batch267.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000026702'
const P = 'bbbbbbbb-0000-4000-8000-000000026701', VP1 = '77777777-0000-4000-8000-000000026711', VP2 = '77777777-0000-4000-8000-000000026712'
const PAY1 = 'dddddddd-0000-4000-8000-0000002671b1', PAY2 = 'dddddddd-0000-4000-8000-0000002671b2'
const ASK = '세금계산서를 보냈어요. 개막식 음향 · 1,500,000원'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString(), today = kstDay(Date.now())
  const vbase = { company_id: C1, category: '음향', contact_name: null, business_no: null, bank_name: null, account_no: null, account_holder: null, memo: null, active: true, created_at: nowIso, user_id: null }
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: P, name: '소리나라', phone: '01026700001', member_type: 'vendor', created_at: nowIso })
  await rest('vendors', 'POST', { ...vbase, id: VP1, name: '소리나라', phone: '01026700001', user_id: P })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: nowIso })
  await rest('vendors', 'POST', { ...vbase, id: VP2, company_id: C2, name: '소리나라', phone: '01026700001', user_id: P })
  const pay = { company_id: C1, job_id: null, quote_id: null, vat_included: true, due_date: today, paid_at: null, invoice_at: null, memo: null, created_at: nowIso }
  await rest('vendor_payments', 'POST', { ...pay, id: PAY1, vendor_id: VP1, title: '개막식 음향', amount: 1500000 })
  await rest('vendor_payments', 'POST', { ...pay, id: PAY2, vendor_id: VP2, company_id: C2, title: '체육대회 음향', amount: 800000 })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const as = async (u) => { await ctx.clearCookies(); await ctx.addCookies([{ name: 'alba_session', value: cookie(u), url: D }]) }
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const row = (title) => p.locator(`[data-pay-row="${title}"]`)

  // ── 1. 업체 '견적·대금': 계산서 알리기 줄
  await as(P)
  await p.goto(`${D}/pro/money`, { waitUntil: 'networkidle' })
  const need1 = row('개막식 음향').locator('[data-invoice="need"]')
  ok("'세금계산서 발행 필요 · 알리기 ›' → 그 회사 문의함 (이 대금)", one(await need1.textContent().catch(() => '')) === '세금계산서 발행 필요 · 알리기 ›' && (await need1.getAttribute('href')) === `/me/chat?co=${C1}&ask=invoice&pay=${PAY1}`)
  ok('다른 회사 대금도 각자 줄', (await row('체육대회 음향').locator('[data-invoice="need"]').getAttribute('href')) === `/me/chat?co=${C2}&ask=invoice&pay=${PAY2}`)
  ok('알리기 줄 한 줄 · 잘리지 않음 · 360px 옆으로 안 밀림', (await need1.evaluate((el) => { const c = getComputedStyle(el); const h = el.getBoundingClientRect().height - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom); const r = document.createRange(); r.selectNodeContents(el); return h / parseFloat(c.lineHeight) < 1.5 && r.getBoundingClientRect().width <= el.clientWidth + 1 }).catch(() => false)) && (await noSide(p)))
  if (SHOTS) {
    await row('개막식 음향').evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(300)
    await row('개막식 음향').locator('xpath=..').screenshot({ path: `${SHOTS}/pro-money-invoice.png` }).catch(() => {})
  }

  // ── 2. 누르면 그 회사 문의함 + 빠른 답장에 준비된 글 → 보냄
  await need1.click()
  await p.waitForURL((u) => u.pathname === '/me/chat', { timeout: 15000 }).catch(() => {})
  await p.waitForLoadState('networkidle')
  const chip = p.locator('[data-quick-lead], [data-quick-replies] button', { hasText: '세금계산서를 보냈어요.' })
  await chip.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok(`빠른 답장 '${ASK}' (대화가 없던 회사여도 그 회사 문의함)`, one(await chip.first().textContent().catch(() => '')).endsWith(ASK) && (await chip.count()) === 1, one(await chip.first().textContent().catch(() => '')))
  await chip.first().click()
  await p.locator('textarea').first().press('Enter')
  await p.waitForTimeout(1500)
  const sent = (await rest(`messages?thread_user_id=eq.${P}`)).filter((m) => m.body === ASK)
  ok('그 회사(주식회사 테스트) 문의함으로 보내짐', sent.length === 1 && sent[0].company_id === C1, JSON.stringify(sent.map((m) => m.company_id)))
  await p.goto(`${D}/pro/money`, { waitUntil: 'networkidle' })
  ok("보낸 뒤 '✓ 계산서 보냈다고 알렸어요 · 확인 전' · 다른 대금은 그대로", one(await row('개막식 음향').locator('[data-invoice="told"]').textContent().catch(() => '')) === '✓ 계산서 보냈다고 알렸어요 · 확인 전' && (await row('체육대회 음향').locator('[data-invoice="need"]').count()) === 1)

  // ── 3. 다른 회사 대금 번호 · 외주사 아닌 사람: 글이 채워지지 않음
  await p.goto(`${D}/me/chat?co=${C1}&ask=invoice&pay=${PAY2}`, { waitUntil: 'networkidle' })
  ok('다른 회사 대금 번호로는 글이 안 채워짐', (await p.locator('[data-quick-lead], [data-quick-replies] button', { hasText: '세금계산서를 보냈어요.' }).count()) === 0)
  await as(W)
  await p.goto(`${D}/me/chat?co=${C2}&ask=invoice&pay=${PAY2}`, { waitUntil: 'networkidle' })
  ok('외주사가 아닌 근무자는 그 회사 문의함도 글도 없음', (await p.locator('[data-quick-lead], [data-quick-replies] button', { hasText: '세금계산서를 보냈어요.' }).count()) === 0 && !(await p.locator('body').innerText()).includes('두번째기획'))

  // ── 4. 회사 관리자 문의 화면: 계산서 받음 한 번에
  await as(A)
  await p.goto(`${D}/admin/chat/${P}`, { waitUntil: 'networkidle' })
  const card = p.locator('[data-invoice-ask]')
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  // (2026-11-17 사용자 요청: 아래 카드 대신 그 문의 말풍선 바로 아래)
  ok("말풍선 아래 '개막식 음향 · 1,500,000원 [계산서 받음]'", (await p.locator('main ol [data-invoice-ask]').count()) === 1 && one(await card.locator('span').first().textContent().catch(() => '')) === '개막식 음향 · 1,500,000원' && (await card.getByRole('button', { name: '계산서 받음' }).count()) === 1)
  ok('관리자 화면 360px 옆으로 안 밀림', await noSide(p))
  if (SHOTS) {
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(400)
    await card.screenshot({ path: `${SHOTS}/admin-invoice-card.png` }).catch(() => {})
  }
  await card.getByRole('button', { name: '계산서 받음' }).click()
  await p.locator('[data-invoice-done]').waitFor({ timeout: 15000 }).catch(() => {})
  const [pay1] = await rest(`vendor_payments?id=eq.${PAY1}`)
  ok("누르면 '✓ 계산서 받음 · 개막식 음향' · 그 대금만 받음 처리", one(await p.locator('[data-invoice-done]').textContent().catch(() => '')) === '✓ 계산서 받음 · 개막식 음향' && pay1?.invoice_at === today && !(await rest(`vendor_payments?id=eq.${PAY2}`))[0]?.invoice_at)

  // ── 5. 업체 화면: 세금계산서 접수됨
  await as(P)
  await p.goto(`${D}/pro/money`, { waitUntil: 'networkidle' })
  ok("업체 화면 '세금계산서 접수됨'", one(await row('개막식 음향').locator('[data-invoice="in"]').textContent().catch(() => '')) === '세금계산서 접수됨')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
