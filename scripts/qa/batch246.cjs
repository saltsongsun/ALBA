// 묶음 246 (정기 개선 2026-11-14 09:35 KST)
// · 외주 업체·전문가 '견적·대금'과 홈 '받을 대금': 대금마다 짧은 배지 하나 — 'n일 지남' · '오늘 지급' · 'D-n' · '협의 중' · '지급 완료'
//   받을 대금 칸에 '지급일 지난 n건' (늦은 대금이 바로 눈에 띄게 · 회사에 연락할 수 있게)
// · 디자인: 대금 줄의 '지급 예정 날짜 · 세금계산서 발행 필요'를 두 줄로 나눔 (360px에서 '필요'만 아래로 떨어지던 것)
// node scripts/qa/batch246.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000246c2'
const P = 'bbbbbbbb-0000-4000-8000-0000000246a1', VP1 = '77777777-0000-4000-8000-0000000246b1', VP2 = '77777777-0000-4000-8000-0000000246b2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  const vbase = { company_id: C1, category: '음향', contact_name: null, business_no: null, bank_name: null, account_no: null, account_holder: null, memo: null, active: true, created_at: nowIso }
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: P, name: '소리나라', phone: '01024600001', member_type: 'vendor', created_at: nowIso })
  await rest('vendors', 'POST', { ...vbase, id: VP1, name: '소리나라', phone: '01024600001', user_id: P })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: nowIso })
  await rest('vendors', 'POST', { ...vbase, id: VP2, company_id: C2, name: '소리나라', phone: '01024600001', user_id: P })
  const pay = { vendor_id: VP1, company_id: C1, job_id: null, quote_id: null, vat_included: true, paid_at: null, invoice_at: null, memo: null, created_at: nowIso }
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000002461a1', title: '개막식 음향', amount: 1500000, due_date: kst(-1) }) // 1일 지남
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000002461a2', vendor_id: VP2, company_id: C2, title: '체육대회 음향', amount: 800000, due_date: kst(0) }) // 오늘
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000002461a3', vendor_id: VP2, company_id: C2, title: '워크숍 음향', amount: 300000, due_date: kst(5), invoice_at: kst(0) }) // D-5
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000002461a4', vendor_id: VP2, company_id: C2, title: '송년회 음향', amount: 500000, due_date: null }) // 협의 중
  await rest('vendor_payments', 'POST', { ...pay, id: 'dddddddd-0000-4000-8000-0000002461a5', title: '리허설 음향', amount: 200000, due_date: kst(-3), paid_at: kst(0), invoice_at: kst(-1) }) // 지급 완료

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(P), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const row = (t) => p.locator(`[data-pay-row="${t}"]`).first()
  const badge = async (t) => ({ tone: await row(t).locator('[data-pay-due]').getAttribute('data-pay-due').catch(() => null), label: one(await row(t).locator('[data-pay-due]').innerText().catch(() => '')) })

  // ── 1. 견적·대금: 대금마다 배지
  await p.goto(`${D}/pro/money`, { waitUntil: 'networkidle' })
  await row('개막식 음향').waitFor({ timeout: 15000 }).catch(() => {})
  const want = { '개막식 음향': ['late', '1일 지남'], '체육대회 음향': ['today', '오늘 지급'], '워크숍 음향': ['soon', 'D-5'], '송년회 음향': ['none', '협의 중'], '리허설 음향': ['paid', '지급 완료'] }
  for (const [t, [tone, label]] of Object.entries(want)) {
    const got = await badge(t)
    ok(`'${t}': '${label}'`, got.tone === tone && got.label === label, JSON.stringify(got))
  }
  ok("받을 대금 칸에 '지급일 지난 1건'", one(await p.locator('[data-pay-late]').innerText().catch(() => '')) === '지급일 지난 1건')
  ok("지난 대금은 날짜 줄도 빨갛게 ('지급 예정 …')", ((await row('개막식 음향').locator('span.text-xs').nth(1).getAttribute('class')) ?? '').includes('text-rose-600'))
  const paidLine = one(await row('리허설 음향').locator('span.text-xs').nth(1).innerText())
  ok("받은 대금은 '받은 날 11/14(토)'처럼 날짜로 (배지 '지급 완료'와 같은 말 반복 없이)", /^받은 날 \d{1,2}\/\d{1,2}\([일월화수목금토]\)$/.test(paidLine), paidLine)
  // 날짜 · 계산서는 각각 한 줄 (360px에서 한 단어만 아래로 떨어지지 않게)
  const lines = await p.locator('[data-pay-row]').evaluateAll((els) => els.map((el) => [...el.querySelectorAll('span.text-xs')].slice(1).map((s) => s.getClientRects().length)))
  ok('대금 줄마다 날짜 한 줄 · 계산서 한 줄', lines.length === 5 && lines.every((l) => l.length === 2 && l.every((n) => n === 1)), JSON.stringify(lines))
  ok("계산서: '세금계산서 발행 필요' / '세금계산서 접수됨'", one(await row('개막식 음향').locator('[data-invoice]').innerText()) === '세금계산서 발행 필요' && one(await row('워크숍 음향').locator('[data-invoice]').innerText()) === '세금계산서 접수됨')
  ok('360px 옆으로 안 밀림 (견적·대금)', await noSide(p))
  if (SHOTS) {
    await p.locator('#pay').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await p.waitForTimeout(300)
    const bx = await p.locator('#pay').boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/pro-money-due.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(560, bx.height + 16) } }).catch(() => {})
  }

  // ── 2. 홈 '받을 대금': 늦은 것부터 · 배지
  await p.goto(`${D}/pro`, { waitUntil: 'networkidle' })
  await row('개막식 음향').waitFor({ timeout: 15000 }).catch(() => {})
  const home = await p.locator('[data-pay-row]').evaluateAll((els) => els.map((el) => [el.getAttribute('data-pay-row'), el.querySelector('[data-pay-due]')?.textContent.trim()]))
  ok("홈 받을 대금: 1일 지남 → 오늘 지급 → D-5 → 협의 중 (받은 대금은 없음)",
    JSON.stringify(home) === JSON.stringify([['개막식 음향', '1일 지남'], ['체육대회 음향', '오늘 지급'], ['워크숍 음향', 'D-5'], ['송년회 음향', '협의 중']]), JSON.stringify(home))
  ok('360px 옆으로 안 밀림 (홈)', await noSide(p))
  if (SHOTS) {
    const sec = p.locator('section', { has: p.locator('h2', { hasText: '받을 대금' }) })
    await sec.evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {})
    await p.waitForTimeout(300)
    await sec.screenshot({ path: `${SHOTS}/pro-home-due.png` }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
