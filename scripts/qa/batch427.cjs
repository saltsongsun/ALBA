// 묶음 427 (정기 개선 2026-11-28 17:36 KST)
// 기능 · 외주 업체 '견적·대금': 받는 중인 견적을 위에 (아직 안 낸 것 먼저 → 마감 가까운 순) · 끝난 견적은 '지난 견적 n개'로 접어 둠
//   · 받는 중인 게 하나도 없으면 끝난 견적을 그대로 펼쳐서 · 회사 고르기(?co=)는 그대로
//   · 아직 안 낸 요청에만 마감 배지 (지남 · 오늘까지 · 내일까지 — 홈과 같은 말)
// 기능 · 관리자 견적 목록: 받는 중인 요청은 마감 가까운 순 · 오늘·내일 마감이면 짧은 배지 (지난 것은 원래 '마감일 지남')
// 디자인 · 배지 0.25초 톡 · 펼치면 0.25초 내려옴 (움직임 줄이기면 없음) · 360px 옆 스크롤 없음
// node scripts/qa/batch427.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000427'
const id = (k) => `42700000-0000-4000-8000-0000000000${k}`
const P = id('e1'), P2 = id('e2')
const V1 = id('a1'), V2 = id('a2'), V3 = id('a3')
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const tok = (k) => `tok427${k}bbbbbbbbbbbbbbbb`

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째상사427', join_code: 'TWO427', seal_image: null, created_at: ago(5) })
  const vendorUser = (uid, name, phone) => rest('users', 'POST', { id: uid, name, phone, role: 'worker', member_type: 'vendor', active: true, careers: [], photo_at: null, created_at: ago(300) })
  await vendorUser(P, '빛소리427', '01042700001')
  await vendorUser(P2, '끝난것만427', '01042700002')
  const vb = { category: '조명', contact_name: '대표', business_no: null, email: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: ago(200) }
  await rest('vendors', 'POST', { ...vb, id: V1, company_id: C1, name: '빛소리427', phone: '01042700001', user_id: P })
  await rest('vendors', 'POST', { ...vb, id: V2, company_id: C2, name: '빛소리427', phone: '01042700001', user_id: P })
  await rest('vendors', 'POST', { ...vb, id: V3, company_id: C1, name: '끝난것만427', phone: '01042700002', user_id: P2 })
  // 견적 (만든 순서는 뒤섞음): key, company, vendor, due, request status, quote status, hours ago
  const rows = [
    ['s', C1, V1, kday(-3), 'closed', 'selected', 1],
    ['e', C1, V1, null, 'open', 'requested', 2],
    ['r', C1, V1, kday(-5), 'closed', 'rejected', 3],
    ['f', C1, V1, kday(0), 'open', 'submitted', 4],
    ['c', C2, V2, kday(1), 'open', 'requested', 5],
    ['x', C1, V1, kday(2), 'cancelled', 'requested', 6],
    ['a', C1, V1, kday(-1), 'open', 'requested', 7],
    ['z', C1, V3, kday(-2), 'closed', 'rejected', 8],
  ]
  const n = { s: 1, e: 2, r: 3, f: 4, c: 5, x: 6, a: 7, z: 8 }
  for (const [k, co, v, due, rst, qst, h] of rows) {
    await rest('quote_requests', 'POST', { id: id(`b${n[k]}`), company_id: co, title: `견적${k}427`, details: null, due_date: due, job_id: null, status: rst, created_by: A, created_at: ago(h) })
    const sent = qst !== 'requested'
    await rest('quotes', 'POST', { id: id(`c${n[k]}`), request_id: id(`b${n[k]}`), vendor_id: v, token: tok(k), status: qst, amount: sent ? 600000 : null, vat_included: true, note: null, submitted_at: sent ? ago(h) : null, submitted_by: sent ? 'vendor' : null, created_at: ago(h) })
  }
  // 관리자 목록용 (C1, 받는 중): 마감 지남 · 오늘 · 내일 · 5일 뒤 · 없음 — 만든 순서는 뒤섞음
  const adm = [['m0', kday(5), 1], ['m1', null, 2], ['m2', kday(1), 3], ['m3', kday(-1), 4], ['m4', kday(0), 5]]
  for (const [k, due, h] of adm) await rest('quote_requests', 'POST', { id: id(`d${k.slice(1)}`), company_id: C1, title: `관리${k}427`, details: null, due_date: due, job_id: null, status: 'open', created_by: A, created_at: ago(h) })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, { reduce = false, company = null } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p, path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    await p.locator('main h1, [data-mode="pro"] h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  }
  const keys = (p, sel) => p.locator(sel).evaluateAll((els) => els.map((e) => (e.textContent.match(/견적([a-z])427/) ?? [])[1]).filter(Boolean))

  // ── 1. 견적·대금: 받는 중 위 · 끝난 것 접힘
  const p = await mk(P)
  await open(p, '/pro/money')
  const top = await keys(p, 'section:has(h2:text("견적 요청")) > div.card > a')
  ok('위 목록: 지남 → 내일 → 마감일 없음 (안 낸 것) → 낸 견적 (두 회사 섞어서)', top.join('') === 'acef', top.join(''))
  const done = await keys(p, '[data-money-quote-done] a')
  ok('접힌 목록: 끝난 견적 3개 (선정 · 미선정 · 취소, 최근 순)', done.join('') === 'srx', done.join(''))
  const sum = one(await p.locator('[data-money-quote-done] summary').innerText().catch(() => ''))
  ok("접기 제목 '지난 견적 3개' · 처음엔 닫힘", sum === '지난 견적 3개' && !(await p.locator('[data-money-quote-done]').evaluate((e) => e.open)), sum)
  const head = one(await p.locator('h2:has-text("견적 요청")').innerText())
  ok('제목 숫자는 그대로 전체 7', head.endsWith('7'), head)
  const due = async (k) => p.locator(`a[href="/quote/${tok(k)}"] [data-money-quote-due]`).evaluate((e) => ({ k: e.getAttribute('data-money-quote-due'), t: e.textContent.trim(), a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationDuration })).catch(() => null)
  const da = await due('a'), dc = await due('c'), df = await due('f'), de = await due('e')
  ok("어제 마감 '지남' (0.25초 톡) · 내일 마감 '내일까지'", da?.t === '지남' && da.a === 'pop' && parseFloat(da.d) === 0.25 && dc?.t === '내일까지', `${JSON.stringify(da)} ${JSON.stringify(dc)}`)
  ok('낸 견적(오늘 마감)·마감일 없음엔 배지 없음', df === null && de === null)
  const rowA = one(await p.locator(`a[href="/quote/${tok('a')}"]`).innerText())
  ok("줄 글자는 그대로 ('아직 금액을 안 보냈어요' · '마감 M/D(요일)' · '견적 내기 →')", rowA.includes('아직 금액을 안 보냈어요') && /마감 \d+\/\d+\(.\)/.test(rowA) && rowA.includes('견적 내기 →'), rowA)
  ok('360px 옆 스크롤 없음', await noSide(p))
  if (SHOTS) { await p.locator('section:has(h2:text("견적 요청"))').scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: `${SHOTS}/427-pro-money.png` }) }
  await p.locator('[data-money-quote-done] summary').click()
  await p.waitForTimeout(80)
  const anim = await p.locator('[data-money-quote-done] > div').evaluate((e) => ({ a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationDuration })).catch(() => null)
  await p.waitForTimeout(350)
  ok("펼치면 3개 보임 · '접기' · 0.25초 내려옴", (await p.locator('[data-money-quote-done] a').nth(2).isVisible()) && one(await p.locator('[data-money-quote-done] summary').innerText()) === '접기' && anim?.a === 'slide-down' && parseFloat(anim.d) === 0.25, JSON.stringify(anim))
  // 회사 고르기
  await open(p, `/pro/money?co=${C2}`)
  const onlyC2 = await keys(p, 'section:has(h2:text("견적 요청")) a')
  ok('둘째상사만 고르면 그 회사 견적만 (접기 없음)', onlyC2.join('') === 'c' && (await p.locator('[data-money-quote-done]').count()) === 0, onlyC2.join(''))

  // ── 2. 끝난 견적만 있는 업체: 접지 않고 그대로
  const q = await mk(P2)
  await open(q, '/pro/money')
  const only = await keys(q, 'section:has(h2:text("견적 요청")) > div.card > a')
  ok('받는 중인 게 없으면 끝난 견적을 그대로 펼쳐서 (접기 없음)', only.join('') === 'z' && (await q.locator('[data-money-quote-done]').count()) === 0, only.join(''))

  // ── 3. 관리자 견적 목록
  const a = await mk(A, { company: C1 })
  await open(a, '/admin/vendors?tab=quotes')
  const order = await a.locator('a[href^="/admin/vendors/requests/"]').evaluateAll((els) => els.map((e) => (e.textContent.match(/관리m(\d)427/) ?? [])[1]).filter(Boolean))
  ok('받는 중인 요청: 마감 지남 → 오늘 → 내일 → 5일 뒤 → 마감일 없음', order.join('') === '34201', order.join(''))
  const rb = async (k) => a.locator(`a[href="/admin/vendors/requests/${id(`d${k}`)}"] [data-request-due]`).evaluate((e) => ({ k: e.getAttribute('data-request-due'), t: e.textContent.trim(), a: getComputedStyle(e).animationName })).catch(() => null)
  const b4 = await rb('4'), b2 = await rb('2'), b3 = await rb('3'), b0 = await rb('0')
  ok("오늘 마감 '오늘까지' · 내일 마감 '내일까지' (톡)", b4?.t === '오늘까지' && b4.a === 'pop' && b2?.t === '내일까지', `${JSON.stringify(b4)} ${JSON.stringify(b2)}`)
  const late = one(await a.locator(`a[href="/admin/vendors/requests/${id('d3')}"]`).innerText())
  ok("지난 요청은 배지 대신 원래 '마감일 지남' · 5일 뒤는 배지 없음", b3 === null && late.includes('마감일 지남') && b0 === null, late)
  ok('관리자 목록 360px 옆 스크롤 없음', await noSide(a))
  ok('다른 회사(둘째상사) 요청은 관리자 목록에 없음', !(await a.locator('main').innerText()).includes('견적c427'))

  // ── 4. 움직임 줄이기
  const r = await mk(P, { reduce: true })
  await open(r, '/pro/money')
  const ra = await r.locator('[data-money-quote-due]').first().evaluate((e) => getComputedStyle(e).animationName).catch(() => 'missing')
  await r.locator('[data-money-quote-done] summary').click()
  await r.waitForTimeout(80)
  const rb2 = await r.locator('[data-money-quote-done] > div').evaluate((e) => getComputedStyle(e).animationName).catch(() => 'missing')
  ok('움직임 줄이기: 배지 톡·펼침 움직임 없음', ra === 'none' && rb2 === 'none', `${ra} ${rb2}`)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch427: ${fails} FAIL` : '== batch427: ALL PASS')
})()
