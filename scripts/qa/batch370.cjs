// 묶음 370 (정기 개선 2026-11-24 03:35 KST)
// · 외주 업체 홈·'견적·대금': 받을 대금은 있는데 답할 견적 요청만 없으면 큰 빈 카드(그림 + 세 줄) 대신
//   대금 아래 한 줄 '답할 견적 요청이 없어요 · 등록된 회사 n곳' (늦은 대금이 첫 화면 위쪽에)
//   · '견적·대금' 화면도 견적 칸은 한 줄 '받은 견적 요청이 없어요 · 새 요청은 알림으로'
//   · 반대로 견적은 있는데 대금이 없으면 대금 칸이 한 줄 '아직 대금 내역이 없어요 · 선정되면 여기에'
//   · 한 줄은 0.25초 살짝 올라오며 나타남 ('움직임 줄이기'면 바로)
//   · 대금도 없으면 예전처럼 큰 안내 (묶음 231이 봄)
// node scripts/qa/batch370.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', C1 = '99999999-0000-4000-8000-000000000099'
const PA = '44444444-0000-4000-8000-0000000370a1', VA = '55555555-0000-4000-8000-0000000370a1' // 대금만 있는 업체
const PB = '44444444-0000-4000-8000-0000000370b1', VB = '55555555-0000-4000-8000-0000000370b1' // 견적만 있는 업체
const R = 'dddddddd-0000-4000-8000-0000000370c1', Q = 'dddddddd-0000-4000-8000-0000000370c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10)
// 한 줄인지: 줄 안 글자 조각들의 윗변이 모두 같음 (3px 안)
const oneLine = (loc) => loc.evaluate((el) => { const t = [...el.querySelectorAll('span')].flatMap((s) => [...s.getClientRects()].map((r) => Math.round(r.top))); return t.length > 0 && Math.max(...t) - Math.min(...t) <= 3 && el.getBoundingClientRect().height < 52 })
const anim = (loc) => loc.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration]).catch(() => [])

;(async () => {
  const nowIso = new Date().toISOString()
  const vendorUser = (id, name, phone) => rest('users', 'POST', { id, name, phone, role: 'worker', member_type: 'vendor', active: true, careers: [], photo_at: null, created_at: nowIso })
  await vendorUser(PA, '무대나라370', '01037000001')
  await vendorUser(PB, '빛소리370', '01037000002')
  const vbase = { company_id: C1, category: '무대', contact_name: '대표', business_no: null, email: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: nowIso }
  await rest('vendors', 'POST', { ...vbase, id: VA, name: '무대나라370', phone: '01037000001', user_id: PA })
  await rest('vendors', 'POST', { ...vbase, id: VB, name: '빛소리370', phone: '01037000002', user_id: PB })
  // A: 지급일 지난 대금 하나 · 견적 요청 없음
  await rest('vendor_payments', 'POST', { id: 'dddddddd-0000-4000-8000-0000000370e1', vendor_id: VA, company_id: C1, job_id: null, quote_id: null, title: '무대 설치370', amount: 2200000, vat_included: true, due_date: kday(-2), paid_at: null, invoice_at: null, memo: null, created_at: nowIso })
  // B: 답할 견적 요청 하나 · 대금 없음
  await rest('quote_requests', 'POST', { id: R, company_id: C1, title: '조명 견적370', details: null, due_date: kday(3), job_id: null, status: 'open', created_by: A, created_at: nowIso })
  await rest('quotes', 'POST', { id: Q, request_id: R, vendor_id: VB, token: 'tok-370-b', status: 'requested', amount: null, vat_included: true, note: null, submitted_at: null, submitted_by: null, created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p, path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    await p.locator('[data-mode="pro"] h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 대금만 있는 업체: 홈
  const a = await mk(PA)
  await open(a, '/pro')
  const row = a.locator('[data-quote-none="home"]')
  ok("홈: 한 줄 '답할 견적 요청이 없어요 · 등록된 회사 1곳'", (await row.count()) === 1 && one(await row.innerText()) === '답할 견적 요청이 없어요 등록된 회사 1곳', one(await row.innerText().catch(() => '')))
  ok('홈: 큰 빈 카드(그림 · 세 줄)는 없음', (await a.locator('[data-partner-linked]').count()) === 0 && (await a.getByText('견적을 요청하면 여기와 휴대폰 알림으로 알려 드려요').count()) === 0)
  ok('홈: 한 줄 (두 줄로 안 꺾임)', await oneLine(row).catch(() => false))
  const payRow = a.locator('[data-pay-row="무대 설치370"]').first()
  ok('홈: 늦은 대금이 그 한 줄보다 위 · 첫 화면 안', (await payRow.count()) === 1 && (await payRow.evaluate((el, r) => !!(el.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING), await row.elementHandle())) && (await payRow.evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight)), String(await payRow.evaluate((el) => Math.round(el.getBoundingClientRect().bottom)).catch(() => '')))
  ok('홈: 0.25초 살짝 올라오며 나타남', JSON.stringify(await anim(row)) === '["rise","0.25s"]', JSON.stringify(await anim(row)))
  ok('360px 옆으로 안 밀림 (홈)', await noSide(a))
  if (SHOTS) {
    const s = await a.locator('section', { has: payRow }).boundingBox()
    const e = await row.boundingBox()
    if (s && e) await a.screenshot({ path: `${SHOTS}/pro-home.png`, clip: { x: 0, y: Math.max(0, s.y - 8), width: 360, height: Math.min(e.y + e.height - s.y + 16, 700) } }).catch(() => {})
  }

  // ── 2. 대금만 있는 업체: 견적·대금
  await open(a, '/pro/money')
  const mrow = a.locator('[data-quote-none="money"]')
  ok("견적·대금: 견적 칸 한 줄 '받은 견적 요청이 없어요 · 새 요청은 알림으로'", (await mrow.count()) === 1 && one(await mrow.innerText()) === '받은 견적 요청이 없어요 새 요청은 알림으로' && (await oneLine(mrow).catch(() => false)), one(await mrow.innerText().catch(() => '')))
  ok('견적·대금: 큰 빈 카드 없음 · 대금 줄은 그대로', (await a.getByText('새 견적 요청이 오면 여기와 휴대폰 알림으로 알려 드려요').count()) === 0 && (await a.locator('[data-pay-row="무대 설치370"]').count()) === 1 && (await a.locator('[data-pay-none]').count()) === 0)
  const mPay = a.locator('[data-pay-row="무대 설치370"]').first()
  ok('견적·대금: 대금 줄이 첫 화면 안', await mPay.evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight), String(await mPay.evaluate((el) => Math.round(el.getBoundingClientRect().bottom)).catch(() => '')))
  ok('360px 옆으로 안 밀림 (견적·대금)', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/pro-money.png` }).catch(() => {})

  // ── 3. 견적만 있는 업체: 대금 칸 한 줄 · 견적은 그대로
  const pb = await mk(PB)
  await open(pb, '/pro/money')
  const prow = pb.locator('[data-pay-none]')
  ok("견적·대금: 대금 칸 한 줄 '아직 대금 내역이 없어요 · 선정되면 여기에'", (await prow.count()) === 1 && one(await prow.innerText()) === '아직 대금 내역이 없어요 선정되면 여기에' && (await oneLine(prow).catch(() => false)), one(await prow.innerText().catch(() => '')))
  ok("견적 요청은 그대로 ('조명 견적370' · '견적 내기 →')", (await pb.locator('a[href="/quote/tok-370-b"]').count()) === 1 && (await pb.locator('a[href="/quote/tok-370-b"]').innerText()).includes('견적 내기 →') && (await pb.locator('[data-quote-none]').count()) === 0)
  await open(pb, '/pro')
  ok('견적이 있으면 홈에 한 줄 안내 없음', (await pb.locator('[data-quote-none]').count()) === 0)

  // ── 4. 움직임 줄이기
  const r = await mk(PA, { reducedMotion: 'reduce' })
  await open(r, '/pro')
  const rd = await r.locator('[data-quote-none="home"]').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok("'움직임 줄이기'면 바로", rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
